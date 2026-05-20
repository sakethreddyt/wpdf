FROM node:18-bullseye-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install LibreOffice and fonts
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libreoffice \
    fonts-dejavu-core \
    fontconfig \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first to take advantage of Docker cache
COPY package*.json ./
RUN npm install --production

# Copy app sources
COPY . ./

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
