# Use the base image that contains all dependencies
FROM yunzaixi4/youchat-proxy-base:latest

# Copy the application code
COPY . /app/

WORKDIR /app

# Expose the port your app runs on
EXPOSE 8080

# Command to run the application
CMD [ "node", "index.mjs" ]