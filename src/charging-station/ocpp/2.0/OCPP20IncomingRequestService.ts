// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import type { JSONSchemaType } from 'ajv';

import OCPPError from '../../../exception/OCPPError';
import type { JsonObject, JsonType } from '../../../types/JsonType';
import {
  OCPP20ClearCacheRequest,
  OCPP20IncomingRequestCommand,
} from '../../../types/ocpp/2.0/Requests';
import type { OCPP20ClearCacheResponse } from '../../../types/ocpp/2.0/Responses';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import { OCPPVersion } from '../../../types/ocpp/OCPPVersion';
import type { IncomingRequestHandler } from '../../../types/ocpp/Requests';
import logger from '../../../utils/Logger';
import type ChargingStation from '../../ChargingStation';
import { ChargingStationUtils } from '../../ChargingStationUtils';
import OCPPConstants from '../OCPPConstants';
import OCPPIncomingRequestService from '../OCPPIncomingRequestService';
import { OCPP20ServiceUtils } from './OCPP20ServiceUtils';

const moduleName = 'OCPP20IncomingRequestService';

export default class OCPP20IncomingRequestService extends OCPPIncomingRequestService {
  private incomingRequestHandlers: Map<OCPP20IncomingRequestCommand, IncomingRequestHandler>;
  private jsonSchemas: Map<OCPP20IncomingRequestCommand, JSONSchemaType<JsonObject>>;

  public constructor() {
    if (new.target?.name === moduleName) {
      throw new TypeError(`Cannot construct ${new.target?.name} instances directly`);
    }
    super(OCPPVersion.VERSION_20);
    this.incomingRequestHandlers = new Map<OCPP20IncomingRequestCommand, IncomingRequestHandler>([
      [OCPP20IncomingRequestCommand.CLEAR_CACHE, this.handleRequestClearCache.bind(this)],
    ]);
    this.jsonSchemas = new Map<OCPP20IncomingRequestCommand, JSONSchemaType<JsonObject>>([
      [
        OCPP20IncomingRequestCommand.CLEAR_CACHE,
        JSON.parse(
          fs.readFileSync(
            path.resolve(
              path.dirname(fileURLToPath(import.meta.url)),
              '../../../assets/json-schemas/ocpp/2.0/ClearCacheRequest.json'
            ),
            'utf8'
          )
        ) as JSONSchemaType<OCPP20ClearCacheRequest>,
      ],
    ]);
    this.validatePayload.bind(this);
  }

  public async incomingRequestHandler(
    chargingStation: ChargingStation,
    messageId: string,
    commandName: OCPP20IncomingRequestCommand,
    commandPayload: JsonType
  ): Promise<void> {
    let response: JsonType;
    if (
      chargingStation.getOcppStrictCompliance() === true &&
      chargingStation.isInPendingState() === true /* &&
       (commandName === OCPP20IncomingRequestCommand.REMOTE_START_TRANSACTION ||
        commandName === OCPP20IncomingRequestCommand.REMOTE_STOP_TRANSACTION ) */
    ) {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle request PDU ${JSON.stringify(
          commandPayload,
          null,
          2
        )} while the charging station is in pending state on the central server`,
        commandName,
        commandPayload
      );
    }
    if (
      chargingStation.isRegistered() === true ||
      (chargingStation.getOcppStrictCompliance() === false &&
        chargingStation.isInUnknownState() === true)
    ) {
      if (
        this.incomingRequestHandlers.has(commandName) === true &&
        OCPP20ServiceUtils.isIncomingRequestCommandSupported(chargingStation, commandName) === true
      ) {
        try {
          this.validatePayload(chargingStation, commandName, commandPayload);
          // Call the method to build the response
          response = await this.incomingRequestHandlers.get(commandName)(
            chargingStation,
            commandPayload
          );
        } catch (error) {
          // Log
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.incomingRequestHandler: Handle incoming request error:`,
            error
          );
          throw error;
        }
      } else {
        // Throw exception
        throw new OCPPError(
          ErrorType.NOT_IMPLEMENTED,
          `${commandName} is not implemented to handle request PDU ${JSON.stringify(
            commandPayload,
            null,
            2
          )}`,
          commandName,
          commandPayload
        );
      }
    } else {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle request PDU ${JSON.stringify(
          commandPayload,
          null,
          2
        )} while the charging station is not registered on the central server.`,
        commandName,
        commandPayload
      );
    }
    // Send the built response
    await chargingStation.ocppRequestService.sendResponse(
      chargingStation,
      messageId,
      response,
      commandName
    );
  }

  private validatePayload(
    chargingStation: ChargingStation,
    commandName: OCPP20IncomingRequestCommand,
    commandPayload: JsonType
  ): boolean {
    if (this.jsonSchemas.has(commandName) === true) {
      return this.validateIncomingRequestPayload(
        chargingStation,
        commandName,
        this.jsonSchemas.get(commandName),
        commandPayload
      );
    }
    logger.warn(
      `${chargingStation.logPrefix()} ${moduleName}.validatePayload: No JSON schema found for command ${commandName} PDU validation`
    );
    return false;
  }

  private handleRequestClearCache(chargingStation: ChargingStation): OCPP20ClearCacheResponse {
    chargingStation.authorizedTagsCache.deleteAuthorizedTags(
      ChargingStationUtils.getAuthorizationFile(chargingStation.stationInfo)
    );
    return OCPPConstants.OCPP_RESPONSE_ACCEPTED;
  }
}
