# Use the base image that contains all dependencies
FROM yunzaixi4/youchat-proxy-base:latest

# Switch to root temporarily for permission operations
USER root

# Copy the application code with proper permissions
COPY . /app/

# Set full permissions for the entire app directory
RUN chown -R node:node /app && \
    chmod -R 777 /app

# Switch back to non-root user for security
USER node

WORKDIR /app

# Expose the port your app runs on
EXPOSE 8080

# Command to run the application
CMD [ "node", "index.mjs" ]