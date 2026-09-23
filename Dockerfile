# Next.js JM Travel — jalan sebagai satu proses (bukan cluster): src/instrumentation.js
# menjalankan job terjadwal di dalam proses, jadi instance harus tepat 1.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
