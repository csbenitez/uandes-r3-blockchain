FROM golang:1.26-alpine AS build
ARG SERVICE
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/app ./cmd/${SERVICE}

FROM alpine:3.20
COPY --from=build /out/app /app
ENTRYPOINT ["/app"]
