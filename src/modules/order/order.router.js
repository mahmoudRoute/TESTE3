import * as orderController from './controller/order.js'
import * as validators from './order.validation.js'
import express from 'express'
import { validation } from '../../middleware/validation.js';

import { endpoint } from './order.endPoint.js'
import { auth } from '../../middleware/auth.js'
import { Router } from "express";
const router = Router()


router.post("/",
    auth(endpoint.create),
    orderController.createOrder
)


router.patch("/:id",
    auth(endpoint.create),
    orderController.cancelOrder
)


export default router