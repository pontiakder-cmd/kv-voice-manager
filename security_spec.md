# Security Specification - Warta Bandung Production Management

## Data Invariants
1. A project must have a title, client, and valid duration.
2. Only PMs or Owners can create projects.
3. User profiles and settings are private. Only admins/PMs can manage the team.
4. Staff can only see projects they are assigned to (as translators, editors, etc.).
5. Users can only edit their own profile settings.

## The Dirty Dozen (Attack Payloads)
1. **Self-Promotion**: Translator tries to change their role to 'pm' in `settings/{uid}`.
2. **Identity Theft**: User A tries to read User B's private settings.
3. **Ghost Project Creation**: Unauthenticated user tries to create a project.
4. **Data Scraping**: Translator tries to list all projects including those they aren't assigned to.
5. **PII Leak**: Translator tries to read another user's email or private settings.
6. **State Jumping**: Editor tries to mark a project as 'done' skipping QC.
7. **Role Hijacking**: Staff tries to assign themselves as 'pm' for a project in `memberRoles`.
8. **ID Spamming**: Attacker tries to create a project with a 2MB string as ID.
9. **Timestamp Spoofing**: User tries to set `updatedAt` to a future date.
10. **Resource Exhaustion**: Attacker tries to upload an array of 10,000 "translators" to a project.
11. **Cross-Project Update**: User tries to update a project they have no role in.
12. **Status Skipping**: Translator tries to move project status directly to 'done'.

## Test Runner (Security assertions)
See `firestore.rules.test.ts` (conceptual).
- `allow create project: if isAdmin() || isPM()`
- `allow read project: if isAdmin() || isPM() || isAssigned(projectId)`
- `allow update project: if isValidProject(incoming()) && (isPM() || canPerformAction())`
