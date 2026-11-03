#!/bin/bash
# Keeps daemon.py running. No 06:30 job and no clock pull live here.
cd "$(dirname "$0")"
while true; do
  pgrep -f "python3 daemon.py" >/dev/null || nohup python3 daemon.py >> daemon.log 2>&1 &
  sleep 60
done
