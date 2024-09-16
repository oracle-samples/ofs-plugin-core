/*
 * Copyright © 2022, 2023, Oracle and/or its affiliates.
 * Licensed under the Universal Permissive License (UPL), Version 1.0  as shown at https://oss.oracle.com/licenses/upl/
 */

import { OFS, OFSCredentials } from "@ofs-users/proxy";

/**
 * A lock for synchronizing async operations.
 * Use this to protect a critical section
 * from getting modified by multiple async operations
 * at the same time.
 */
export class Mutex {
    /**
     * When multiple operations attempt to acquire the lock,
     * this queue remembers the order of operations.
     */
    private _queue: {
        resolve: (release: ReleaseFunction) => void;
    }[] = [];

    private _isLocked = false;

    /**
     * Wait until the lock is acquired.
     * @returns A function that releases the acquired lock.
     */
    acquire() {
        return new Promise<ReleaseFunction>((resolve) => {
            this._queue.push({ resolve });
            this._dispatch();
        });
    }

    /**
     * Enqueue a function to be run serially.
     *
     * This ensures no other functions will start running
     * until `callback` finishes running.
     * @param callback Function to be run exclusively.
     * @returns The return value of `callback`.
     */
    async runExclusive<T>(callback: () => Promise<T>) {
        const release = await this.acquire();
        try {
            return await callback();
        } finally {
            release();
        }
    }

    /**
     * Check the availability of the resource
     * and provide access to the next operation in the queue.
     *
     * _dispatch is called whenever availability changes,
     * such as after lock acquire request or lock release.
     */
    private _dispatch() {
        if (this._isLocked) {
            // The resource is still locked.
            // Wait until next time.
            return;
        }
        const nextEntry = this._queue.shift();
        if (!nextEntry) {
            // There is nothing in the queue.
            // Do nothing until next dispatch.
            return;
        }
        // The resource is available.
        this._isLocked = true; // Lock it.
        // and give access to the next operation
        // in the queue.
        nextEntry.resolve(this._buildRelease());
    }

    /**
     * Build a release function for each operation
     * so that it can release the lock after
     * the operation is complete.
     */
    private _buildRelease(): ReleaseFunction {
        return () => {
            // Each release function make
            // the resource available again
            this._isLocked = false;
            // and call dispatch.
            this._dispatch();
        };
    }
}

type ReleaseFunction = () => void;
export class OFSMessage {
    apiVersion: number = -1;
    method: string = "no method";
    securedData?: any;
    sendInitData?: boolean;

    static parse(str: string) {
        try {
            return Object.assign(
                new OFSMessage(),
                JSON.parse(str)
            ) as OFSMessage;
        } catch (error) {
            return new OFSMessage();
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
    CallProcedureResult = "callProcedureResult",
    CallProcedure = "callProcedure",
}

export class OFSOpenMessage extends OFSMessage {
    entity: string | undefined;
}

export class OFSInitMessage extends OFSMessage {
    applications: any | undefined;
}
export class OFSInitMessage_applications {
    type: string | undefined;
    resourceUrl: string | undefined;
}
export class OFSCallProcedureResultMessage extends OFSMessage {
    callId: string | undefined;
    resultData: any | undefined;
}

export class OFSCloseMessage extends OFSMessage {
    method: string = "close";
    activity?: any;
}

declare global {
    var callId: string;
    var waitForProxy: boolean;
}
export abstract class OFSPlugin {
    private _proxy!: OFS;
    private _tag: string;
    private _mutex: Mutex = new Mutex();
    private _release: any;

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
    private async _getWebMessage(message: MessageEvent): Promise<boolean> {
        console.log(`${this._tag}: Message received:`, message.data);
        console.log(`${this._tag}: Coming from ${message.origin}`);
        // Validate that it is a valid OFS message
        var parsed_message = OFSMessage.parse(message.data);

        switch (parsed_message.method) {
            case "init":
                this._storeInitData(parsed_message as OFSInitMessage);
                this._init(parsed_message);
                break;
            case "open":
                //globalThis.waitForProxy = false;
                this._createProxy(parsed_message);
                this._release = await this._mutex.acquire();
                this.open(parsed_message as OFSOpenMessage);
                this._release();
                break;
            case "updateResult":
                this.updateResult(parsed_message);
                break;
            case "callProcedureResult":
                this._callProcedureResult(
                    parsed_message as OFSCallProcedureResultMessage
                );
                break;
            case "wakeUp":
                this.wakeup(parsed_message);
                break;
            case "error":
                this.error(parsed_message);
                break;
            case "no method":
                console.warn(`${this._tag}: Message discarded`);
                break;

            default:
                throw new Error(`Unknown method ${parsed_message.method}`);
                break;
        }
        return true;
    }

    private async _init(message: OFSMessage) {
        this.init(message);
        var messageData: OFSMessage = {
            apiVersion: 1,
            method: "initEnd",
        };
        this._sendWebMessage(messageData);
    }
    private _sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private _generateCallId(): string {
        const characters =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let result = "";
        const charactersLength = characters.length;
        for (let i = 0; i < charactersLength; i++) {
            result += characters.charAt(
                Math.floor(Math.random() * charactersLength)
            );
        }
        return result;
    }
    private async _createProxy(message: OFSMessage) {
        var applications = this.getInitProperty("applications");

        if (applications != null) {
            applications = JSON.parse(applications);
            for (const [key, value] of Object.entries(applications)) {
                var applicationKey: string = key;
                var application: any = value as OFSInitMessage_applications;
                if (application.type == "ofs") {
                    this.storeInitProperty("baseURL", application.resourceUrl);
                    var callId = this._generateCallId();
                    globalThis.callId = callId;
                    var callProcedureData = {
                        callId: callId,
                        procedure: "getAccessToken",
                        params: {
                            applicationKey: applicationKey,
                        },
                    };
                    console.debug(
                        `${
                            this.tag
                        }. I will request the Token for the application ${applicationKey} with this message ${JSON.stringify(
                            callProcedureData
                        )}`
                    );
                    this.callProcedure(callProcedureData);
                    //globalThis.waitForProxy = true;
                    this._release = await this._mutex.acquire();
                    return;
                }
            }
        }
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
            }
        }
    }
    private _storeInitData(message: OFSInitMessage) {
        if (message.applications) {
            this.storeInitProperty(
                "applications",
                JSON.stringify(message.applications)
            );
        }
    }
    public storeInitProperty(property: string, data: any) {
        console.debug(`${this.tag}.${property}: Storing ${property}`, data);
        window.localStorage.setItem(`${this.tag}.${property}`, data);
    }

    public getInitProperty(property: string): any {
        var data = window.localStorage.getItem(`${this.tag}.${property}`);
        return data;
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
    public callProcedure(data?: any): void {
        this.sendMessage(Method.CallProcedure, data);
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
    callProcedureResult(parsed_message: OFSCallProcedureResultMessage) {
        throw new Error("CALLPROCEDURERESULT Method not implemented.");
    }
    private _callProcedureResult(
        parsed_message: OFSCallProcedureResultMessage
    ) {
        if ((parsed_message.callId = globalThis.callId)) {
            var baseURLOFS = this.getInitProperty("baseURL");
            if ("resultData" in parsed_message) {
                if (
                    "status" in parsed_message.resultData &&
                    parsed_message.resultData.status == "success"
                ) {
                    var OFSCredentials: OFSCredentials = {
                        baseURL: baseURLOFS,
                        token: parsed_message.resultData.token,
                    };
                    console.debug(
                        `${
                            this.tag
                        }. I will create the proxy with this credentials ${JSON.stringify(
                            OFSCredentials
                        )}`
                    );
                    this._proxy = new OFS(OFSCredentials);
                    this._release();
                    return;
                }
            } else {
                console.error(
                    `${
                        this.tag
                    }. Problems processing the Token Response ${JSON.stringify(
                        parsed_message
                    )}`
                );
                this._release();
            }
        } else {
            console.debug(
                `${this.tag}. CallId is not the one generated for getting the token '${globalThis.callId}' vs '${parsed_message.callId}'`
            );
            this.callProcedureResult(
                parsed_message as OFSCallProcedureResultMessage
            );
        }
    }
}
