FROM node:24.22.2-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates curl fonts-liberation libasound2 libatk-bridge2.0-0 \
       libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 \
       libnspr4 libnss3 libx11-6 libxcomposite1 libxdamage1 libxext6 \
       libxfixes3 libxkbcommon0 libxrandr2 openbox unzip x11-utils xauth xdotool xvfb \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL --retry 3 \
       https://storage.googleapis.com/chrome-for-testing-public/120.0.6099.109/linux64/chrome-linux64.zip \
       -o /tmp/chrome.zip \
    && unzip -q /tmp/chrome.zip -d /opt \
    && rm /tmp/chrome.zip \
    && /opt/chrome-linux64/chrome --version
