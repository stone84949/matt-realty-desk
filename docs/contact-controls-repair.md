
## Contact controls repair - 2026-10-05

The missing delete action was an interface gap: archive PATCH already existed.
Reuse archive state instead of removing rows or changing the schema. Add explicit
Edit/Delete buttons, confirmation, a Deleted contacts filter and Restore. Keep
notes, linked reminders, activities and unsubscribe state. Imported select values
must survive editing; dates must populate date inputs. Keep local Python list
parity because the UI is shared. No bulk delete and no sample-data removal.

Regression checks cover archive/list/restore, cancellation, failures, retained
history/consent, invalid filter input and local list parity. Live data now includes
owner-imported samples, so replace the invented-only sidebar claim. Database
content and account security boundaries remain unchanged by deployment.
