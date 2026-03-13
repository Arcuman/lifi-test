import "reflect-metadata";

import {
  getModelForClass,
  index,
  modelOptions,
  prop,
  Severity
} from "@typegoose/typegoose";

@index({ chainId: 1, blockHash: 1, logIndex: 1 }, { unique: true })
@index({
  chainId: 1,
  integrator: 1,
  orphaned: 1,
  blockNumber: -1,
  logIndex: -1,
  _id: -1
})
@index({
  integrator: 1,
  orphaned: 1,
  blockNumber: -1,
  logIndex: -1,
  chainId: -1,
  _id: -1
})
@index({
  chainId: 1,
  contractAddress: 1,
  eventName: 1,
  orphaned: 1,
  blockNumber: 1
})
@modelOptions({
  options: {
    allowMixed: Severity.ALLOW
  },
  schemaOptions: {
    collection: "fee_events",
    versionKey: false
  }
})
export class FeeEventModelClass {
  @prop({ required: true, type: () => Number })
  public chainId!: number;

  @prop({ required: true, type: () => String })
  public contractAddress!: string;

  @prop({ required: true, default: "FeesCollected", type: () => String })
  public eventName!: "FeesCollected";

  @prop({ required: true, type: () => Number })
  public blockNumber!: number;

  @prop({ required: true, type: () => String })
  public blockHash!: string;

  @prop({ required: true, type: () => Date })
  public blockTimestamp!: Date;

  @prop({ required: true, type: () => String })
  public transactionHash!: string;

  @prop({ required: true, type: () => Number })
  public transactionIndex!: number;

  @prop({ required: true, type: () => Number })
  public logIndex!: number;

  @prop({ required: true, type: () => String })
  public token!: string;

  @prop({ required: true, type: () => String })
  public integrator!: string;

  @prop({ required: true, type: () => String })
  public integratorFee!: string;

  @prop({ required: true, type: () => String })
  public lifiFee!: string;

  @prop({ required: true, default: false, type: () => Boolean })
  public removed!: boolean;

  @prop({ required: true, default: false, type: () => Boolean })
  public orphaned!: boolean;

  @prop({ type: () => [String] })
  public rawTopics?: string[];

  @prop({ type: () => String })
  public rawData?: string;

  @prop({ required: true, type: () => Date })
  public syncedAt!: Date;
}

export const getFeeEventModel = () => getModelForClass(FeeEventModelClass);
