# syntax=docker/dockerfile:1

# Stage 1: Build the application
FROM oven/bun:1.3-alpine AS builder

# Set up the working directory
WORKDIR /app

# Copy dependency manifests
COPY package.json bun.lock nx.json tsconfig.base.json ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source files
COPY tools ./tools
COPY libs ./libs
COPY apps ./apps

# Build the application with Nx
#RUN --mount=type=secret,id=nx-cloud-access-token,env=NX_CLOUD_ACCESS_TOKEN \
#    bunx nx run-many --target=build --projects=server,frontend --prod
RUN --mount=type=secret,id=nx-cloud-access-token,env=NX_CLOUD_ACCESS_TOKEN \
    bunx nx run-many --target=build --projects=server --prod


# Stage 2: Production image
FROM oven/bun:1.3-alpine AS production

# Set up the working directory
WORKDIR /app

# Copy dependency manifests
COPY package.json bun.lock ./

# Install only production dependencies
RUN bun install --frozen-lockfile --production

# Copy built output
COPY --from=builder /app/dist/apps/server ./dist/apps/server

#COPY --from=builder /app/dist/apps/frontend/browser ./dist/apps/frontend/browser

# Environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Start the application
CMD ["bun", "dist/apps/server/main.js"]
