# palworld

A pulumi project to spin up a Palworld server on a GCP VM

## Useful commands

### Check startup script logs

```bash
sudo journalctl -u google-startup-scripts.service
```

### Rerun startup script

```bash
sudo google_metadata_script_runner --script-type startup
```
