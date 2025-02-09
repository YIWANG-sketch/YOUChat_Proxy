# Use the official Node.js 20 image as the base image
FROM node:20

# Set proper tmp permissions
RUN chmod 1777 /tmp

# Install necessary dependencies for running Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    apt-transport-https \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] https://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Set up the working directory in the container
WORKDIR /app

# Copy package files for dependency installation
COPY ../package*.json ./

# Install Node.js dependencies
RUN npm install

# Create a non-root user
RUN useradd -m appuser && chown -R appuser /app
USER appuser

# This is a base image, so we don't expose ports or set CMD
