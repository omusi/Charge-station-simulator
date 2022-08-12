// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { parentPort, workerData } from 'worker_threads';

import { ThreadWorker } from 'poolifier';
import { MessageEvent } from 'ws';

import {
  ChargingStationWorkerData,
  ChargingStationWorkerMessage,
  ChargingStationWorkerMessageEvents,
} from '../types/ChargingStationWorker';
import { RequestCommand } from '../types/ocpp/Requests';
import {
  AuthorizeRequest,
  AuthorizeResponse,
  StartTransactionRequest,
  StartTransactionResponse,
  StopTransactionReason,
  StopTransactionRequest,
  StopTransactionResponse,
} from '../types/ocpp/Transaction';
import { ProcedureName } from '../types/UIProtocol';
import logger from '../utils/Logger';
import Utils from '../utils/Utils';
import WorkerConstants from '../worker/WorkerConstants';
import ChargingStation from './ChargingStation';
import { ChargingStationUtils } from './ChargingStationUtils';
import WorkerChannel from './WorkerChannel';

// Conditionally export ThreadWorker instance for pool usage
export let threadWorker: ThreadWorker;
if (ChargingStationUtils.workerPoolInUse()) {
  threadWorker = new ThreadWorker<ChargingStationWorkerData>(startChargingStation, {
    maxInactiveTime: WorkerConstants.POOL_MAX_INACTIVE_TIME,
    async: false,
  });
} else {
  // Add message listener to start charging station from main thread
  addMessageListener();
  console.debug('workerData:', workerData);
  if (!Utils.isUndefined(workerData)) {
    const data = workerData as string;
    try {
      WorkerChannel.instance.start();
      console.debug('bc start worker:', WorkerChannel.instance);
      WorkerChannel.instance.onmessage = handleChannelMessage;
    } catch (error) {
      console.debug(error);
    }
    // startChargingStation(data);
  }
}

/**
 *
 * @param message
 */
function handleChannelMessage(message: MessageEvent): void {
  console.debug('message:', message.data);
}

// TODO: change the type and put it in it's own file in the types folder
class TEMP {
  public hashId: string;
  public command: ProcedureName;
  public connectorId: number;
  public idTag: string | null;
}

let station: ChargingStation;

/**
 * @param connectorId Id of the connector used
 * @param idTag RFID tag used
 */
async function startTransaction(connectorId: number, idTag: string): Promise<void> {
  // TODO: change to allow the user to test an unauthorised badge
  station.getConnectorStatus(connectorId).authorizeIdTag = idTag;
  try {
    const authorizeResponse = await station.ocppRequestService.requestHandler<
      AuthorizeRequest,
      AuthorizeResponse
    >(station, RequestCommand.AUTHORIZE, {
      idTag,
    });

    const startResponse = await station.ocppRequestService.requestHandler<
      StartTransactionRequest,
      StartTransactionResponse
    >(station, RequestCommand.START_TRANSACTION, {
      connectorId,
      idTag,
    });
  } catch (error: unknown) {
    console.error(error);
  }
}

/**
 * @param connectorId Id of the connector used
 */
async function stopTransaction(connectorId: number): Promise<void> {
  try {
    const transactionId = station.getConnectorStatus(connectorId).transactionId;

    const stopResponse = await station.ocppRequestService.requestHandler<
      StopTransactionRequest,
      StopTransactionResponse
    >(station, RequestCommand.STOP_TRANSACTION, {
      transactionId,
      meterStop: station.getEnergyActiveImportRegisterByTransactionId(transactionId),
      idTag: station.getTransactionIdTag(transactionId),
      reason: StopTransactionReason.NONE,
    });
  } catch (error: unknown) {
    console.error(error);
  }
}

/**
 * Listen messages send by the main thread
 */
function addMessageListener(): void {
  parentPort?.on('message', (message: ChargingStationWorkerMessage) => {
    logger.debug(`${logPrefix()} ${JSON.stringify(message)}`);
    if (message.id === ChargingStationWorkerMessageEvents.START_WORKER_ELEMENT) {
      startChargingStation(message.data);
    }
  });
}

/**
 * Create and start a charging station instance
 *
 * @param data workerData
 */
function startChargingStation(data: ChargingStationWorkerData): void {
  station = new ChargingStation(data.index, data.templateFile);
  station.start();
}

/**
 * @returns ChargingStationWorker logger prefix
 */
function logPrefix(): string {
  return Utils.logPrefix(' ChargingStationWorker |');
}
