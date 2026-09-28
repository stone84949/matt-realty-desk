import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"
GUIDE = STATIC / "plugin-guide.html"
RUNBOOK = ROOT / "docs" / "PLUGIN-SETUP.md"
CATALOG = ROOT / "docs" / "plugins-reviewed.json"
NOTICES = ROOT / "docs" / "THIRD_PARTY_NOTICES.md"
STATIC_NOTICES = STATIC / "plugin-notices.html"


class PluginGuideTests(unittest.TestCase):
    def test_help_links_to_local_plugin_guide(self):
        index = (STATIC / "index.html").read_text(encoding="utf-8")
        self.assertIn('href="/plugin-guide.html"', index)

    def test_guide_covers_each_reviewed_plugin_once(self):
        guide = GUIDE.read_text(encoding="utf-8")
        catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
        self.assertEqual(len(catalog["plugins"]), 12)
        for plugin in catalog["plugins"]:
            with self.subTest(repository=plugin["repository"]):
                self.assertEqual(guide.count(f'github.com/{plugin["repository"]}'), 1)
                self.assertIn(plugin["asset"], guide)
                self.assertIn(
                    f'data-plugin-id="{plugin["plugin_id"]}" data-classification="{plugin["classification"]}"',
                    guide,
                )
                self.assertIn(plugin["reviewed_sha"], NOTICES.read_text(encoding="utf-8"))

    def test_guide_uses_local_accessible_previews(self):
        guide = GUIDE.read_text(encoding="utf-8")
        images = [
            source
            for source in re.findall(r'<img\s+[^>]*src="([^"]+)"[^>]*>', guide)
            if source.startswith("/assets/plugin-guide/")
        ]
        self.assertEqual(len(images), 12)
        for source in images:
            with self.subTest(source=source):
                self.assertTrue(source.startswith("/assets/plugin-guide/"))
                self.assertTrue((STATIC / source.removeprefix("/")).is_file())
        preview_tags = re.findall(r'<img\s+[^>]*src="/assets/plugin-guide/[^"]+"[^>]*>', guide)
        self.assertTrue(all(re.search(r'alt="[^"]+"', tag) for tag in preview_tags))

    def test_guide_is_review_only_and_marks_risk(self):
        guide = GUIDE.read_text(encoding="utf-8")
        self.assertNotIn("data-install", guide)
        self.assertIn("Not for this HP", guide)
        self.assertIn("Apple Silicon", guide)
        self.assertIn("Owner tool", guide)
        self.assertIn("Install now", guide)
        self.assertIn("unsandboxed", guide.lower())
        self.assertNotIn("<style", guide.lower())
        self.assertNotIn("<script", guide.lower())
        self.assertIn('href="/plugin-guide.css"', guide)
        for name in json.loads(CATALOG.read_text(encoding="utf-8"))["plugins"]:
            self.assertRegex(guide, rf'>{re.escape(name["name"])} source and attribution</a>')

    def test_runbook_pins_before_enabling_the_four_approved_initial_installs(self):
        runbook = RUNBOOK.read_text(encoding="utf-8")
        self.assertNotRegex(runbook, r"(?m)^omarchy plugin add .+ --enable$")
        catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
        approved = [plugin for plugin in catalog["plugins"] if plugin["classification"] == "install_now"]
        self.assertEqual(len(approved), 4)
        for plugin in approved:
            sequence = [
                f'omarchy plugin add https://github.com/{plugin["repository"]}.git',
                f'git -C ~/.config/omarchy/plugins/{plugin["plugin_id"]} checkout --detach {plugin["reviewed_sha"]}',
                f'omarchy plugin validate ~/.config/omarchy/plugins/{plugin["plugin_id"]}',
                f'omarchy plugin enable {plugin["plugin_id"]}',
            ]
            positions = [runbook.find(command) for command in sequence]
            self.assertTrue(all(position >= 0 for position in positions), plugin["name"])
            self.assertEqual(positions, sorted(positions), plugin["name"])
        self.assertIn("omarchy plugin list --json", runbook)
        self.assertIn("one at a time", runbook.lower())
        self.assertIn("review the diff", runbook.lower())

    def test_every_bundled_asset_has_complete_mit_provenance(self):
        catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
        notices = NOTICES.read_text(encoding="utf-8")
        static_notices = STATIC_NOTICES.read_text(encoding="utf-8")
        self.assertIn("MIT License", notices)
        for plugin in catalog["plugins"]:
            with self.subTest(plugin=plugin["name"]):
                self.assertIn(plugin["asset"], notices)
                self.assertIn(plugin["repository"], notices)
                self.assertIn(plugin["source_path"], notices)
                self.assertIn(plugin["copyright"], notices)
                self.assertIn(plugin["asset"], static_notices)
                self.assertIn(plugin["repository"], static_notices)
                self.assertIn(plugin["reviewed_sha"], static_notices)
                self.assertIn(plugin["source_path"], static_notices)
                self.assertIn(plugin["copyright"], static_notices)


if __name__ == "__main__":
    unittest.main()
