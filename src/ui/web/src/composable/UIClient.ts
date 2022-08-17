import { JsonType } from '@/type/JsonType';
import { ProcedureName } from '@/type/UIProtocol';
import { SimulatorUI } from '@/type/SimulatorUI';
import Utils from './Utils';
import config from '@/assets/config';
import { v4 as uuidv4 } from 'uuid';

export default class UIClient {
  private static _instance: UIClient | null = null;

  private _ws: WebSocket;
  private _responseHandlers: Map<
    string,
    {
      resolve: (value: JsonType | PromiseLike<JsonType>) => void;
      reject: (reason?: any) => void;
    }
  >;

  private constructor() {
    this._ws = new WebSocket(
      `ws://${config.emobility.host}:${config.emobility.port}`,
      config.emobility.protocol
    );

    this._responseHandlers = new Map<
      string,
      {
        resolve: (value: unknown | PromiseLike<unknown>) => void;
        reject: (reason?: any) => void;
      }
    >();

    this._ws.onmessage = this.handleMessage.bind(this);
  }

  public static get instance() {
    if (UIClient._instance === null) {
      UIClient._instance = new UIClient();
    }
    return UIClient._instance;
  }

  public onOpen(listener: (this: WebSocket, ev: Event) => void) {
    this._ws.addEventListener('open', listener);
  }

  public async listChargingStations(): Promise<SimulatorUI[]> {
    console.debug('listChargingStations');

    const list = await this.send(ProcedureName.LIST_CHARGING_STATIONS, {});

    return list as SimulatorUI[];
  }

  public async startTransaction(hashId: string, connectorId: number, idTag: string): Promise<void> {
    console.debug('startTransaction');

    const _ = await this.send(ProcedureName.START_TRANSACTION, {
      hashId,
      connectorId,
      idTag,
      command: ProcedureName.START_TRANSACTION,
    });
  }

  public async stopTransaction(hashId: string, connectorId: number): Promise<void> {
    console.debug('stopTransaction');

    const _ = await this.send(ProcedureName.STOP_TRANSACTION, {
      hashId,
      connectorId,
      command: ProcedureName.STOP_TRANSACTION,
    });
  }

  private setHandler(
    id: string,
    resolve: (value: JsonType | PromiseLike<JsonType>) => void,
    reject: (reason?: any) => void
  ) {
    this._responseHandlers.set(id, { resolve, reject });
  }

  private getHandler(id: string) {
    return this._responseHandlers.get(id);
  }

  private async send(command: ProcedureName, data: JsonType): Promise<JsonType> {
    let uuid: string;
    return Utils.promiseWithTimeout(
      new Promise((resolve, reject) => {
        uuid = uuidv4();
        const msg = JSON.stringify([uuid, command, data]);

        if (this._ws.readyState === this._ws.OPEN) {
          console.debug('Send message:', msg);
          this._ws.send(msg);
        } else {
          throw new Error('Send message: connection not opened');
        }

        this.setHandler(uuid, resolve, reject);
      }),
      60 * 1000,
      Error('Send message timeout'),
      () => {
        this._responseHandlers.delete(uuid);
      }
    );
  }

  private handleMessage(ev: MessageEvent<any>): void {
    const data = JSON.parse(ev.data);

    if (Utils.isIterable(data) === false) {
      throw new Error('Message not iterable: ' + JSON.stringify(data, null, 2));
    }

    const [uuid, response] = data;

    let messageHandler;
    if (this._responseHandlers.has(uuid) === true) {
      messageHandler = this.getHandler(uuid);
    } else {
      throw new Error('Message not a response: ' + JSON.stringify(data, null, 2));
    }

    messageHandler?.resolve(response);
  }
}
