# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for canvas and sqlite3
RUN apk add --no-cache python3 make g++ cairo-dev jpeg-dev pango-dev giflib-dev

COPY package.json package-lock.json ./

RUN npm install

# Runtime stage
FROM node:24-alpine3.23

WORKDIR /app

# Install runtime dependencies for canvas
RUN apk add --no-cache cairo jpeg pango giflib

# Copy node_modules and app from builder
COPY --from=builder /app/node_modules ./node_modules

COPY . .

# Create directory for SQLite database
RUN mkdir -p /app/data

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

CMD ["npm", "start"]
