# Use the base image that contains all dependencies
FROM yunzaixi4/youchat-proxy-base:latest

# Switch to root for permissions
USER root

# Copy the application code
COPY . /app/

WORKDIR /app

# Create config directory with proper permissions
RUN mkdir -p /app/config && \
    chmod -R 777 /app/config

# Expose the port your app runs on
EXPOSE 8080

# Command to run the application
CMD [ "node", "index.mjs" ]