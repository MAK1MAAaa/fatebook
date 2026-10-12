FROM nginx:1.30.5-alpine@sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94

# The production build is prepared locally by the packaging command.
RUN rm -rf /usr/share/nginx/html/*
COPY --chmod=644 deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html/
RUN find /usr/share/nginx/html -type d -exec chmod 755 {} + \
    && find /usr/share/nginx/html -type f -exec chmod 644 {} +

EXPOSE 6657
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD test -s /usr/share/nginx/html/index.html && wget -q -O /dev/null http://127.0.0.1:6657/healthz || exit 1
