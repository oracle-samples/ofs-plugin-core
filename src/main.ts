/*
 * Copyright © 2022, 2023, Oracle and/or its affiliates.
 * Licensed under the Universal Permissive License (UPL), Version 1.0  as shown at https://oss.oracle.com/licenses/upl/
 */

import { OFS, OFSCredentials } from "@ofs-users/proxy";

export class OFSMessage {
    apiVersion: number = -1;
    method: string = "no method";
    securedData?: any;
    sendInitData?: boolean;

    //Start : Issue#17
    enableBackButton?:boolean; 
    showHeader?: boolean;
    sendMessageAsJsObject?: boolean;
    dataItems?: Array<string>;
    //End : Issue#17

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

    /**
     * 
     * @param {string} tag Plugin Tag/Name
     * @param {boolean} [initOverride = false] Defaults to false. When false, invokes the Setup method implicitly and sends the ready message to OFS Core immediatly. When set to true, allows the implementing plugin call the Setup function explicitly. This allows the implementing plugin to control when Plugin starts communication with OFS Core application.
     */
    constructor(tag: string, initOverride: boolean = false) {
        console.log(`${tag}: Created`);

        this._tag = tag;
        //For backward compatibility. When initOverride param is not provided in contructor, the setup mothod would be called automatically without requiring the plugins to make any changes in their implementation. 
        if(!initOverride){
            this.setup(); //Issue#17: Method converted to public and can be invoked explicitly by the implementing calss.
        }
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
                globalThis.waitForProxy = false;
                this._createProxy(parsed_message);
                var iteration: number = 0;
                while (globalThis.waitForProxy) {
                    // I need to wait for the Proxy creation
                    console.debug(
                        `${this._tag}: Waiting for the Proxy creation`
                    );
                    await this._sleep(100);
                    console.log("Slept for 100 ms");
                    iteration++;
                    if (iteration > 30) {
                        console.error(`${this._tag}: Proxy creation problem`);
                        globalThis.waitForProxy = false;
                        break;
                    }
                }
                this.open(parsed_message as OFSOpenMessage);
                break;
            case "updateResult":
                this.updateResult(parsed_message);
                break;
            case "callProcedureResult":
                this._callProcedureResult(
                    parsed_message as OFSCallProcedureResultMessage
                );
                break;
            case "wakeup":
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
        //Issue#18: Awaits the init method to finish and receives message data for initEnd message in return 
        this.init(message).then((messageData)=>{
            this._sendWebMessage(messageData);
        })
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
    private _createProxy(message: OFSMessage) {
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
                        }. I will request the Token forthe application ${applicationKey} with this message ${JSON.stringify(
                            callProcedureData
                        )}`
                    );
                    this.callProcedure(callProcedureData);
                    globalThis.waitForProxy = true;
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

    // Issue#17: Converted to a public method allowing implementing plugin to pass additional parameters to OFS. 
    /**
     * Setups event listeners and initiates the communication between Plugin & OFS by sending 'ready' message.
     * The Implementing plugin can can call this method explicitly unlike before where it was auto called in constructor only. For that, 
     * Plugin needs to pass an additional parameter to constructor 'initOverride' as true. otherwise, this function is auto called implicitly.
     * @param {boolean} sendInitData defaults to true
     * @param {boolean} enableBackButton defaults to true
     * @param {boolean} showHeader defaults to true
     * @param {boolean} sendMessageAsJsObject defaults to false
     * @param {Array<string>} dataItems defatuls to null
     * 
     * @example
     * ``` ts
     * //Implement the OFS Plugin
     * class MyPlugin Extends OFSPlugin{
     *  constructor () {
     *      super("myPlugin", true);
     *  }
     * }
     * 
     * let myPluginInstance = new MyPlugin(); //instantiate your plugin
     * myPluginInstance.Setup(); //call 'Setup' method to start communication with OFS
     * 
     * ```
     * For details see: https://docs.oracle.com/en/cloud/saas/field-service/fapcf/c-readymethod-new.html
     */
    public setup(sendInitData:boolean = true, enableBackButton:boolean = true, showHeader:boolean = true, sendMessageAsJsObject:boolean = false, dataItems?:Array<string>) {
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
    
    //Issue#18
    /**
     * Performs plugin initialization tasks before sending the initEnd message to OFS.
     * Must return a promise that resolves to an OFSMessage. The resolved OFSMessage is sent to OFS as initEnd.
     * Implementing plugin can override this method and add additional properties to the messageData e.g. wakeup settings etc.
     * 
     * For details, See: https://docs.oracle.com/en/cloud/saas/field-service/fapcf/c-initendmethod.html
     * 
     * @param message 
     * @returns {Promise<OFSMessage>}  
     */
    init(message: OFSMessage): Promise<OFSMessage> {
        //Issue#18: returns a promise with a minimal initEnd messageData by default. 
        return new Promise((resolve,reject)=>{
            // Nothing to be done if not needed
            console.warn(`${this._tag}: Empty init method`);
            var messageData: OFSMessage = {
                apiVersion: 1,
                method: "initEnd",
            };
            resolve(messageData);
        })
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
        if (parsed_message.callId == globalThis.callId) {
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
                        }. I will create the proxy with this data ${JSON.stringify(
                            OFSCredentials
                        )}`
                    );
                    this._proxy = new OFS(OFSCredentials);
                    globalThis.waitForProxy = false;
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
