FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
# System libs needed to build the "canvas" native module (pulled in transitively by
# pdf-to-img, used to render PDF pages to images for AI invoice recognition, task #7).
# Alpine ships no prebuilt musl binary for every node-canvas version, so these build
# headers let npm compile it from source if the prebuilt fetch fails.
RUN apk add --no-cache build-base g++ cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev pixman-dev
COPY package.json package-lock.json* ./
RUN npm ci

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Runtime shared libraries for the compiled "canvas" module (see deps stage above) — the
# .node binary dynamically links against these, so they're needed here too, not just at
# build time. No -dev/build-base needed here, just the shared libs themselves.
RUN apk add --no-cache cairo pango jpeg giflib librsvg

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/canvas ./node_modules/canvas

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
