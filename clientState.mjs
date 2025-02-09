class ClientState {
    constructor() {
        this._closed = false;
    }

    close() {
        this._closed = true;
    }

    isClosed() {
        return this._closed;
    }

    reset() {
        this._closed = false;
    }
}

export const clientState = new ClientState();
