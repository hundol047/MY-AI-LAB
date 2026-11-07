# 오늘강원 앱 서버 (정적 앱 + 후기·예약 신청·가게 등록 API). 데이터는 APP_DB_PATH(디스크)에 SQLite로 저장한다.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 8080
CMD ["node", "server.mjs"]
