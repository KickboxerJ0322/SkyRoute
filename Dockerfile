FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_GOOGLE_MAPS_API_KEY
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
RUN npm test && npm run build
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 SKYROUTE_DATA_MODE=mock
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
USER node
EXPOSE 8080
CMD ["node", "server/index.mjs"]
