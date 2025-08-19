import { describe, expect, it, jest } from '@jest/globals';
import { createMailbox } from '../examples/common/actors/createActor';
import {
    AnyEnvelope,
    connectActorToActor,
    createActorFactory,
    createEnvelope,
    Envelope,
    UnknownEnvelope,
} from '../src';
import './locks'
