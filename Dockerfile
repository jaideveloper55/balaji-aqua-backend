FROM node:22-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
COPY prisma ./prisma/
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "start:dev"]
