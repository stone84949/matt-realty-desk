-- Invented demo records only; apply once to dedicated demo DB after migration.
INSERT INTO contacts(first_name,last_name,email,type,stage,source,notes,email_permission,created_at,updated_at) VALUES
('Taylor','Example','taylor@example.test','Buyer','Active','Demo','Invented buyer interested in nearby parks.','Not asked','2026-10-01T12:00:00Z','2026-10-01T12:00:00Z'),
('Morgan','Sample','morgan@example.test','Seller','New','Demo','Invented seller planning a spring move.','Not asked','2026-10-01T12:00:00Z','2026-10-01T12:00:00Z');
INSERT INTO tasks(contact_id,title,due_at,priority,created_at) SELECT id,'Prepare neighborhood shortlist','2026-10-05','Normal','2026-10-01T12:00:00Z' FROM contacts WHERE email='taylor@example.test';
INSERT INTO activities(contact_id,kind,summary,occurred_at) SELECT id,'Note','Invented conversation about nearby parks.','2026-10-01T12:00:00Z' FROM contacts WHERE email='taylor@example.test';
INSERT INTO campaigns(name,body,created_at,updated_at) VALUES('Autumn neighborhood update','Invented draft for editing. Nothing sent.','2026-10-01T12:00:00Z','2026-10-01T12:00:00Z');
