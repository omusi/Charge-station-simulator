import { BroadcastChannel } from 'worker_threads';

import { JsonType } from '../../../types/JsonType';
import {
  ProtocolCommand,
  ProtocolRequestHandler,
  ProtocolVersion,
} from '../../../types/UIProtocol';
import { AbstractUIServer } from '../AbstractUIServer';
import AbstractUIService from './AbstractUIService';

export default class UIService001 extends AbstractUIService {
  private channel = new BroadcastChannel('test');

  constructor(uiServer: AbstractUIServer) {
    super(uiServer, ProtocolVersion['0.0.1']);
    this.messageHandlers.set(
      ProtocolCommand.START_TRANSACTION,
      this.handleStartTransaction.bind(this) as ProtocolRequestHandler
    );
    this.messageHandlers.set(
      ProtocolCommand.STOP_TRANSACTION,
      this.handleStopTransaction.bind(this) as ProtocolRequestHandler
    );
  }

  private handleStartTransaction(payload: JsonType): void {
    this.channel.postMessage(payload);
  }

  private handleStopTransaction(payload: JsonType): void {
    this.channel.postMessage(payload);
  }
}
