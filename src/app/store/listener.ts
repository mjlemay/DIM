import { createListenerMiddleware } from '@reduxjs/toolkit';
import { DimThunkDispatch, RootState } from './types';

export const listenerMiddleware = createListenerMiddleware<RootState, DimThunkDispatch>();
