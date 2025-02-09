#!/bin/bash

# Start the D-Bus daemon
if [ ! -e /var/run/dbus/system_bus_socket ]; then
    dbus-daemon --system --fork
fi

# Start Xvfb
Xvfb :99 -screen 0 1280x1024x24 &

# Wait for Xvfb to be ready
while ! xdpyinfo -display :99 >/dev/null 2>&1; do
    echo "Waiting for Xvfb..."
    sleep 0.1
done

# Execute the main command
exec "$@"
