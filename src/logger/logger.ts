import { createLogger, transports, format } from "winston";
import LokiTransport from "winston-loki";
import env from "../env";

const basicAuthentication = env.LOKI_USER_ID + ':' + env.LOKI_API_KEY

const options = {
  level: 'debug',
  format: format.combine(
    format.timestamp(), 
    format.json()    
  ),
  transports: [
    new LokiTransport({
      host: env.GRAFANA_HOST, 
      labels: { app: 'video-service' }, 
      json: true,                 
      basicAuth: basicAuthentication,
      replaceTimestamp: true,      
      onConnectionError: (err) => console.error(err), 
      
    }),

    new transports.Console({
      format: format.combine(
        format.colorize(),      
        format.simple()         
      )
    })
  ]
};

export const logger = createLogger(options);
