/*
 * Copyright © 2022, 2023, Oracle and/or its affiliates.
 * Licensed under the Universal Permissive License (UPL), Version 1.0  as shown at https://oss.oracle.com/licenses/upl/
 */

import { OFS } from "@ofs-users/proxy";

export class OFSMessage {
    apiVersion: number = -1;
    method: string = "no method";
    securedData?: any;
    sendInitData?: boolean;

    static parse(str: string) {
        try {
            return Object.assign(new OFSMessage(), JSON.parse(str)) as OFSMessage;
        } catch (error) {
            return new OFSMessage()
        }
    }
}

export enum Method {
    Close = "close",
    Open = "open",
    Update = "update",
    UpdateResult = "updateResult",
    Init = "init",
    Ready = "ready",
    InitEnd = "initEnd",
}

export class OFSOpenMessage extends OFSMessage {
    entity: string | undefined;
}

export class OFSCloseMessage extends OFSMessage {
    method: string = "close";
    activity?: any;
}

export abstract class OFSPlugin {
    private _proxy!: OFS;
    private _tag: string;

    constructor(tag: string) {
        console.log(`${tag}: Created`);

        this._tag = tag;

        this._setup();
    }

    get proxy(): OFS {
        return this._proxy;
    }

    get tag(): string {
        return this._tag;
    }

    /**
     * Processes received messages
     * @param message Message received
     * @returns
     */
    private _getWebMessage(message: MessageEvent): boolean {
        console.log(`${this._tag}: Message received:`, message.data);
        console.log(`${this._tag}: Coming from ${message.origin}`);
        // Validate that it is a valid OFS message
        var parsed_message = OFSMessage.parse(message.data);
        switch (parsed_message.method) {
            case "init":
                this._init(parsed_message);
                break;
            case "open":
                this.open(parsed_message as OFSOpenMessage);
                break;
            case "updateResult":
                this.updateResult(parsed_message);
                break;
            case "wakeUp":
                this.wakeup(parsed_message);
                break;
            case "error":
                this.error(parsed_message);
                break;
            case "no method":
                console.warn(`${this._tag}: Message discarded`)

            default:
                throw new Error(`Unknown method ${parsed_message.method}`);
                break;
        }
        return true;
    }

    private async _init(message: OFSMessage) {
        // Processing securedData variables
        if (message.securedData) {
            console.log(`${this._tag}: Processing`, message.securedData);
            // STEP 1: are we going to create a proxy?
            if (
                message.securedData.ofsInstance &&
                message.securedData.ofsClientId &&
                message.securedData.ofsClientSecret
            ) {
                this._proxy = new OFS({
                    instance: message.securedData.ofsInstance,
                    clientId: message.securedData.ofsClientId,
                    clientSecret: message.securedData.ofsClientSecret,
                });
                var result = await this._proxy.getSubscriptions();
                console.log(
                    `${this._tag}: Connection with ${message.securedData.ofsInstance} successful: `,
                    result.status == 200
                );
            }
            // STEP 2: do we need to store type information?
            // TBD
        }
        this.init(message);
        var messageData: OFSMessage = {
            apiVersion: 1,
            method: "initEnd",
        };
        this._sendWebMessage(messageData);
    }

    private static _getOriginURL(url: string) {
        if (url != "") {
            if (url.indexOf("://") > -1) {
                return "https://" + url.split("/")[2];
            } else {
                return "https://" + url.split("/")[0];
            }
        }
        return "";
    }
    private _sendWebMessage(data: OFSMessage) {
        console.log(
            `${this._tag}: Sending  message` +
            JSON.stringify(data, undefined, 4)
        );
        var originUrl =
            document.referrer ||
            (document.location.ancestorOrigins &&
                document.location.ancestorOrigins[0]) ||
            "";

        if (originUrl) {
            parent.postMessage(data, OFSPlugin._getOriginURL(originUrl));
        }
    }

    public sendMessage(method: Method, data?: any): void {
        this._sendWebMessage({
            apiVersion: 1,
            method: method,
            ...data,
        });
    }

    private _setup() {
        console.log("OFS plugin ready");
        window.addEventListener(
            "message",
            this._getWebMessage.bind(this),
            false
        );
        var messageData: OFSMessage = {
            apiVersion: 1,
            method: "ready",
            sendInitData: true,
        };
        this._sendWebMessage(messageData);
    }

    // There should be always an 'open' method
    abstract open(data: OFSOpenMessage): void;

    // These methods can be overwritten
    init(message: OFSMessage) {
        // Nothing to be done if not needed
        console.warn(`${this._tag}: Empty init method`);
    }

    public close(data?: any): void {
        this.sendMessage(Method.Close, data);
    }

    public update(data?: any): void {
        this.sendMessage(Method.Update, data);
    }

    error(parsed_message: OFSMessage) {
        throw new Error("ERROR Method not implemented.");
    }
    wakeup(parsed_message: OFSMessage) {
        throw new Error("WAKEUP Method not implemented.");
    }
    updateResult(parsed_message: OFSMessage) {
        throw new Error("UPDATERESULT Method not implemented.");
    }
}
