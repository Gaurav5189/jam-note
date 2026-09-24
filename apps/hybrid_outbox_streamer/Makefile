.PHONY: all build build-linux test vet clean

BINARY_NAME=streamer
BUILD_DIR=bin

all: test vet build

build:
	go build -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/streamer

build-linux:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o $(BUILD_DIR)/$(BINARY_NAME)-linux-amd64 ./cmd/streamer

test:
	go test -v -race ./...

vet:
	go vet ./...

clean:
	rm -rf $(BUILD_DIR)
