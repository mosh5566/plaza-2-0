# PLAZA 2.0 — Production Docker image
FROM node:20-alpine
WORKDIR /app

# התקנת תלויות native build (better-sqlite3)
RUN apk add --no-cache python3 make g++ sqlite

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# התיקיות שצריכות persistence
RUN mkdir -p /app/db /app/uploads

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server/server.js"]
