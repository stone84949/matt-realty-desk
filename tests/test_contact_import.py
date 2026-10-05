import json
import gc
import sqlite3
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

import server


class ContactImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.paths = patch.multiple(server, DATA_DIR=root, DB_PATH=root / "realty.db", BACKUP_DIR=root / "backups")
        self.paths.start()
        server.initialize()
        self.http = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        gc.collect()
        self.paths.stop()
        self.temp.cleanup()

    def import_contacts(self, contacts):
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.http.server_port}/api/import/contacts",
            data=json.dumps({"contacts": contacts}).encode(),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as response:
            return response.code, json.load(response)

    def test_deleted_contacts_list_is_recoverable(self):
        self.import_contacts([{"first_name": "Archived synthetic"}])
        with server.db() as conn:
            conn.execute("UPDATE contacts SET archived=1")
        root = f"http://127.0.0.1:{self.http.server_port}/api/contacts"
        with urllib.request.urlopen(root) as response:
            self.assertEqual(json.load(response), [])
        with urllib.request.urlopen(root + "?archived=1") as response:
            self.assertEqual(len(json.load(response)), 1)
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(root + "?archived=bad")
        self.assertEqual(error.exception.code, 400)

    def test_distinct_people_keep_shared_email_and_phone(self):
        contacts = [
            {"first_name": "Alex", "last_name": "Example", "email": "family@example.test", "phone": "555-010-1000"},
            {"first_name": "Sam", "last_name": "Example", "email": "family@example.test", "phone": "555-010-1000"},
        ]
        status, result = self.import_contacts(contacts)
        self.assertEqual(status, 201)
        self.assertEqual(result["imported"], 2)
        self.assertEqual(len(server.rows("SELECT * FROM contacts")), 2)

    def test_identical_reimport_is_skipped_without_overwriting(self):
        contact = {"first_name": "Alex", "email": "alex@example.test", "notes": "Private note"}
        self.import_contacts([contact])
        _, result = self.import_contacts([contact])
        self.assertEqual(result["imported"], 0)
        self.assertEqual(result["duplicates_skipped"], 1)
        self.assertEqual(len(server.rows("SELECT * FROM contacts")), 1)

    def test_concurrent_identical_imports_add_one_record_per_round(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            for index in range(20):
                gate = threading.Barrier(2)
                contact = {"first_name": "Alex", "notes": f"Synthetic batch {index}"}

                def submit():
                    gate.wait(timeout=5)
                    return self.import_contacts([contact])

                results = list(pool.map(lambda _: submit(), range(2)))
                self.assertEqual(sum(result["imported"] for _, result in results), 1)
        self.assertEqual(len(server.rows("SELECT * FROM contacts")), 20)

    def test_same_name_and_phone_with_different_notes_is_preserved(self):
        contacts = [{"first_name": "Alex", "phone": "5550101000", "notes": note} for note in ("Source row 2", "Source row 3")]
        _, result = self.import_contacts(contacts)
        self.assertEqual(result["imported"], 2)

    def test_overlong_fields_reject_entire_batch_without_truncation(self):
        status, result = self.import_contacts([{"first_name": "Valid"}, {"first_name": "x" * 101}])
        self.assertEqual(status, 400)
        self.assertIn("row 2", result["error"].lower())
        self.assertEqual(len(server.rows("SELECT * FROM contacts")), 0)

    def test_import_keeps_notes_address_and_unconfirmed_consent(self):
        notes = "Second phone: 5550101001\nSecond email: extra@example.test"
        _, result = self.import_contacts([{"first_name": "Alex", "notes": notes, "city": "Example City", "email_permission": "Opted in"}])
        self.assertEqual(result["imported"], 1)
        contact = server.rows("SELECT * FROM contacts")[0]
        self.assertEqual(contact["notes"], notes)
        self.assertEqual(contact["city"], "Example City")
        self.assertEqual(contact["email_permission"], "Not asked")

    def test_backup_restores_contacts_and_remains_unique(self):
        self.import_contacts([{"first_name": "Alex", "notes": "Restore me"}])
        one = server.backup()
        two = server.backup()
        self.assertNotEqual(one, two)
        with sqlite3.connect(one) as restored:
            self.assertEqual(restored.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(restored.execute("SELECT notes FROM contacts").fetchone()[0], "Restore me")


if __name__ == "__main__":
    unittest.main()
