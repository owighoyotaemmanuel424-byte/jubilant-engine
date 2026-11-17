FROM oven/bun:1.2.22-alpine
RUN addgroup -S runner && adduser -S runner -G runner
WORKDIR /app
COPY health.ts ./health.ts
USER runner
EXPOSE 8080
CMD ["bun", "run", "health.ts"]
