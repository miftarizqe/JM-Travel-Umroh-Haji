# Next.js JM Travel — jalan sebagai satu proses (bukan cluster): src/instrumentation.js
# menjalankan job terjadwal di dalam proses, jadi instance harus tepat 1.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .

# NEXT_PUBLIC_* diinline webpack ke bundle client SAAT build ini (bukan
# runtime CMD di bawah) — harus masuk lewat ARG (docker-compose.web.yml
# meneruskan dari build.args), env compose runtime SENDIRIAN gak akan
# kebaca titik ini.
ARG NEXT_PUBLIC_RECAPTCHA_SITE_KEY
ARG NEXT_PUBLIC_SNAPWIDGET_ID
ARG NEXT_PUBLIC_GA_ID
ARG NEXT_PUBLIC_FB_PIXEL_ID
ENV NEXT_PUBLIC_RECAPTCHA_SITE_KEY=$NEXT_PUBLIC_RECAPTCHA_SITE_KEY \
    NEXT_PUBLIC_SNAPWIDGET_ID=$NEXT_PUBLIC_SNAPWIDGET_ID \
    NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID \
    NEXT_PUBLIC_FB_PIXEL_ID=$NEXT_PUBLIC_FB_PIXEL_ID

RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
