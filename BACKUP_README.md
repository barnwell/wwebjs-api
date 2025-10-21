# WhatsApp Sessions Backup & Restore

This document explains how to backup and restore WhatsApp session data for your wwebjs instances.

## Backup Script

### Usage

```bash
# Backup all instances
./backup-sessions.sh

# Backup specific instance
./backup-sessions.sh instance-name

# Backup to custom directory
./backup-sessions.sh instance-name /path/to/backups
```

### Examples

```bash
# Backup all instances to default ./backups directory
./backup-sessions.sh

# Backup only "dispatcher-1" instance
./backup-sessions.sh dispatcher-1

# Backup "dispatcher-2" to custom location
./backup-sessions.sh dispatcher-2 /home/user/whatsapp-backups
```

### What Gets Backed Up

- All `session-*` directories containing WhatsApp authentication data
- `webhook-urls.json` file with webhook configurations
- Chat history and media (if stored locally)
- Session authentication tokens

### Backup File Format

Backups are created as compressed tar.gz files with the naming format:
```
{instance-name}_sessions_{YYYY-MM-DD_HH-MM-SS}.tar.gz
```

Example: `dispatcher-1_sessions_2025-10-21_19-30-45.tar.gz`

## Restore Script

### Usage

```bash
./restore-backup.sh <instance-name> <backup-file.tar.gz>
```

### Examples

```bash
# Restore dispatcher-1 from backup
./restore-backup.sh dispatcher-1 dispatcher-1_sessions_2025-10-21_19-30-45.tar.gz

# Restore with full path
./restore-backup.sh my-instance /path/to/backups/my-instance_sessions_2025-10-21_19-30-45.tar.gz
```

### Restoration Process

1. **Stops the container** (if running)
2. **Clears existing sessions** in the container
3. **Extracts and copies** backup files to container
4. **Sets proper permissions** (node:node ownership)
5. **Ready to start** - you can start the instance from the orchestrator

### Important Notes

- **Always stop the instance** before restoring to prevent data corruption
- **Backup regularly** - WhatsApp sessions can become invalid over time
- **Test restores** in a development environment first
- **Keep multiple backups** - don't rely on a single backup file

## Automation

### Cron Job Example

Add to your crontab to backup all instances daily at 2 AM:

```bash
# Edit crontab
crontab -e

# Add this line
0 2 * * * /path/to/your/backup-sessions.sh >> /var/log/whatsapp-backup.log 2>&1
```

### Weekly Cleanup

Remove backups older than 30 days:

```bash
# Add to crontab for weekly cleanup
0 3 * * 0 find /path/to/backups -name "*.tar.gz" -mtime +30 -delete
```

## Troubleshooting

### Common Issues

1. **Permission Denied**
   ```bash
   chmod +x backup-sessions.sh restore-backup.sh
   ```

2. **Container Not Found**
   - Ensure the instance name is correct
   - Check if the container exists: `docker ps -a | grep wwebjs-`

3. **Backup Failed**
   - Check if the container is running
   - Verify Docker permissions
   - Check available disk space

4. **Restore Failed**
   - Ensure the backup file exists and is not corrupted
   - Check Docker permissions
   - Verify the container exists

### Verification

After restoration, verify the session works:

1. Start the instance from the orchestrator
2. Check the session status in the Sessions tab
3. If disconnected, scan the QR code to reconnect
4. Test sending a message to verify functionality

## Security Considerations

- **Backup files contain sensitive data** - store them securely
- **Encrypt backups** if storing remotely
- **Limit access** to backup files and scripts
- **Regular cleanup** of old backup files
- **Monitor backup logs** for any failures

## File Locations

- **Backup Script**: `./backup-sessions.sh`
- **Restore Script**: `./restore-backup.sh`
- **Default Backup Directory**: `./backups/`
- **Container Sessions Path**: `/app/sessions/`
- **Webhook URLs**: Stored in `webhook-urls.json`