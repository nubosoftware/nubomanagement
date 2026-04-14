# JPDC - Migration from Active Directory to Local Nubo Authentication

## Summary of Changes

We have made the following server-side changes to support removing Active Directory authentication while preserving the Exafe virtual keyboard with SHA-256 password handling.

## Code Changes (2 files modified)

### 1. `nubo-management-enterprise/src/Exafe/exafe.js`

Added optional SHA-256 hashing of the decrypted password, controlled by the `ExafeSha256` setting. When `ExafeSha256` is set to `true` in Settings.json, the Exafe module will SHA-256 hash the decrypted plain-text password before returning it to the server. This ensures the server never sees the plain-text password and the same SHA-256 value used previously with AD is now used for local Nubo authentication.

### 2. `nubo-management-enterprise/src/passwordUtils.js`

When `ExafeSha256` is enabled, the server-side password complexity validation (must contain digit, letter, and special character) is skipped during password set/change operations. This is necessary because the server validates the SHA-256 hex hash (which only contains characters `[0-9a-f]`), not the original password. Password complexity is enforced by the Exafe virtual keyboard on the client side.

## Configuration Changes Required

The following settings need to be updated in `Settings.json`:

| Setting | Value | Description |
|---------|-------|-------------|
| `ActiveDirectoryAuthenticate` | `false` | Disable AD first-login authentication |
| `checkPasswordWithAD` | `false` | Disable AD password checking at login |
| `virtualKeyboardEnabled` | `true` | Keep virtual keyboard enabled (no change) |
| `virtualKeyboardType` | `"Exafe"` | Keep Exafe as virtual keyboard type (no change) |
| `ExafeSha256` | `true` | **New setting** - Enable SHA-256 hashing in Exafe decrypt |

## Password Migration Procedure

After applying the code and configuration changes, existing user passwords need to be migrated from AD to the Nubo database. For each user:

1. Obtain the user's SHA-256 hashed password (the same value that was previously used for AD authentication)
2. Import it into Nubo using the admin API:

```
POST /api/profiles/{user_email}
```

with parameter `password` set to the SHA-256 hash value.

The Nubo server will automatically hash this value with SHA-512 + per-user salt for secure storage. When the user subsequently logs in, the Exafe module will produce the same SHA-256 hash, which will be matched against the stored value.

For new users, passwords can be set through the same admin API, providing the SHA-256 hash of the desired password as the `password` parameter.

## Authentication Flow After Migration

```
Device: User types password -> Exafe virtual keyboard encrypts
Server: Exafe Java decrypts -> plain text -> SHA-256 hash
        -> SHA-512_HMAC(SHA-256_hash, user_salt) -> compare with Nubo DB
```

## Important Notes

- **Client-side code**: This change covers the Nubo server-side only. We have not reviewed the custom JPDC client application code. If the client supports set new password or change password flows through the Exafe virtual keyboard, please verify that these flows work correctly after the migration. The client-side behavior is not in the scope of this change.

- **Password complexity**: After this change, server-side password complexity validation (digit + letter + special character) is delegated to the client-side Exafe virtual keyboard. Please ensure the client enforces the required password policy.

- **Rollback**: If needed, setting `ExafeSha256` back to `false` and re-enabling `checkPasswordWithAD: true` will restore the previous AD authentication behavior (assuming AD is still available).
