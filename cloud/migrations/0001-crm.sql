
        CREATE TABLE IF NOT EXISTS contacts (
          id INTEGER PRIMARY KEY,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          street_address TEXT NOT NULL DEFAULT '',
          address_line_2 TEXT NOT NULL DEFAULT '',
          city TEXT NOT NULL DEFAULT '',
          state TEXT NOT NULL DEFAULT '',
          postal_code TEXT NOT NULL DEFAULT '',
          type TEXT NOT NULL DEFAULT 'Prospect',
          stage TEXT NOT NULL DEFAULT 'New',
          source TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          email_permission TEXT NOT NULL DEFAULT 'Not asked',
          last_contact_at TEXT,
          next_follow_up_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY,
          contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          due_at TEXT,
          priority TEXT NOT NULL DEFAULT 'Normal',
          completed_at TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS activities (
          id INTEGER PRIMARY KEY,
          contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
          kind TEXT NOT NULL DEFAULT 'Note',
          summary TEXT NOT NULL,
          occurred_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS campaigns (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          channel TEXT NOT NULL DEFAULT 'Email',
          audience TEXT NOT NULL DEFAULT 'All opted-in contacts',
          subject TEXT NOT NULL DEFAULT '',
          body TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'Draft',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_contacts_stage ON contacts(stage) WHERE archived=0;
        CREATE INDEX IF NOT EXISTS idx_contacts_follow_up ON contacts(next_follow_up_at) WHERE archived=0;
        CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(completed_at, due_at);
        CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id, occurred_at);
        PRAGMA optimize;
