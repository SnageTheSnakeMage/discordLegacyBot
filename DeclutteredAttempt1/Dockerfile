# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for canvas and sqlite3
RUN apk add --no-cache python3 make g++ cairo-dev jpeg-dev pango-dev giflib-dev

COPY package*.json ./

RUN npm ci

# Runtime stage
FROM node:24-alpine3.23

WORKDIR /app

# Install runtime dependencies for canvas (including dev headers for bindings)
RUN apk add --no-cache cairo-dev jpeg-dev pango-dev giflib-dev

# Copy node_modules and app from builder
COPY --from=builder /app/node_modules ./node_modules

COPY . .

CMD ["node", "index.js"]
