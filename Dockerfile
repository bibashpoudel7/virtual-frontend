# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Enable corepack for yarn
RUN corepack enable

# Copy package files (.yarn is not committed; corepack fetches Yarn from package.json's packageManager)
COPY package.json yarn.lock .yarnrc.yml ./

# Install dependencies
RUN yarn install --immutable

# Copy source code (includes .env file from CI/CD)
COPY . .

# Build the application (picks up NEXT_PUBLIC_ vars from .env)
RUN yarn build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Enable corepack for yarn
RUN corepack enable

# Set environment to production
ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run the application
CMD ["node", "server.js"]
