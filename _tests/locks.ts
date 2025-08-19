// @ts-ignore
import { AbortController, locks } from 'web-locks';
import { locksProvider } from '../src/providers';

locksProvider.delegate = locks;
global.AbortController = AbortController;
