import json
import urllib.error
import urllib.request
import unittest
from tests import test_contact_import as fixtures

class DraftAndTypeTests(unittest.TestCase):
    setUp = fixtures.ContactImportTests.setUp
    tearDown = fixtures.ContactImportTests.tearDown

    def request(self, path, method='GET', body=None):
        request = urllib.request.Request(f'http://127.0.0.1:{self.http.server_port}'+path,
            method=method, data=None if body is None else json.dumps(body).encode(),
            headers={'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as response:
            return response.code, json.load(response)

    def test_type_filter_and_draft_edit_persist(self):
        self.request('/api/contacts','POST',{'first_name':'Buyer sample','type':'Buyer'})
        self.request('/api/contacts','POST',{'first_name':'Seller sample','type':'Seller'})
        self.assertEqual(len(self.request('/api/contacts?type=Buyer')[1]),1)
        _,draft=self.request('/api/campaigns','POST',{'name':'Synthetic','body':'Before','audience':'Contact #7'})
        status,updated=self.request(f'/api/campaigns/{draft["id"]}','PATCH',{'body':'After','expected_updated_at':draft['updated_at']})
        self.assertEqual(status,200)
        self.assertEqual(updated['id'],draft['id'])
        self.assertEqual(updated['audience'],'Contact #7')
        self.assertEqual(self.request('/api/campaigns')[1][0]['body'],'After')
        self.assertEqual(self.request(f'/api/campaigns/{draft["id"]}','PATCH',{'body':'Unguarded'})[0],400)
        self.assertEqual(self.request('/api/campaigns')[1][0]['body'],'After')
        self.assertEqual(self.request(f'/api/campaigns/{draft["id"]}','PATCH',{'body':'Stale','expected_updated_at':'old'})[0],409)
        self.assertEqual(self.request(f'/api/campaigns/{draft["id"]}','PATCH',{'status':'Sent'})[0],400)
