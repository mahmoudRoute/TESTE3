import { asyncHandler } from "../../../utils/errorHandling.js";
import productModel from '../../../../DB/model/Product.model.js'
import couponModel from '../../../../DB/model/Coupon.model.js'
import { clearCart, removeItems } from "../../cart/controller/cart.js";
import orderModel from "../../../../DB/model/Order.model.js";
import cartModel from "../../../../DB/model/Cart.model.js";

// export const createOrderDummyOrder = asyncHandler(async (req, res, next) => {
//     const { products, paymentType, note, address, phone, couponName } = req.body;


//     // Check coupon
//     if (couponName) {
//         const coupon = await couponModel.findOne({
//             name: couponName.toLowerCase(),
//             usedBy: { $nin: req.user._id }
//         })
//         if (!coupon || (coupon?.expire.getTime() < Date.now())) {
//             return next(new Error("In-valid Coupon", { cause: 400 }))
//         }
//         req.body.coupon = coupon
//     }

//     // check products
//     let productList = [];
//     let subtotal = 0
//     for (let product of products) {
//         const checkedProduct = await productModel.findById(product.productId);
//         if (!product || product?.isDeleted) {
//             return next(new Error("In-valid productId", { cause: 400 }))
//         }
//         if (checkedProduct.stock < product.quantity) {
//             return next(new Error("Out of stock", { cause: 400 }))
//         }

//         product.name = checkedProduct.name;
//         product.unitPrice = checkedProduct.finalPrice;
//         product.finalPrice = Number((product.unitPrice * product.quantity).toFixed(2));

//         subtotal += product.finalPrice
//         productList.push(product)
//     }

//     const dummyOrder = {

//         userId: req.user._id,
//         note,
//         address,
//         phone,
//         products: productList,
//         couponId: req.body.coupon?._id,
//         subtotal,
//         totalPillAmount: Number((subtotal - (subtotal * ((req.body.coupon?.amount || 0) / 100))).toFixed(2)),
//         paymentType,
//         status: paymentType == "card" ? "waitForPayment" : "placed"
//     }

//     return res.json({ message: "Done", order: dummyOrder })


// })

export const createOrder = asyncHandler(async (req, res, next) => {
    const { paymentType, note, address, phone, couponName } = req.body;

    if (!req.body.products) {
        const cart = await cartModel.findOne({ userId: req.user._id })
        if (!cart || !cart?.products.length) {
            return next(new Error("cart is empty", { cause: 400 }))
        }
        req.body.products = cart.products;
        req.body.isCart = true;
    }
    // Check coupon
    if (couponName) {
        const coupon = await couponModel.findOne({
            name: couponName.toLowerCase(),
            usedBy: { $nin: req.user._id }
        })
        if (!coupon || (coupon?.expire.getTime() < Date.now())) {
            return next(new Error("In-valid Coupon", { cause: 400 }))
        }
        req.body.coupon = coupon
    }

    // check products
    let productList = [];
    let subtotal = 0
    let productIds = []
    for (let product of req.body.products) {
        const checkedProduct = await productModel.findById(product.productId);
        if (!product || product?.isDeleted) {
            return next(new Error("In-valid productId", { cause: 400 }))
        }
        if (checkedProduct.stock < product.quantity) {
            return next(new Error("Out of stock", { cause: 400 }))
        }

        if (req.body.isCart) {
            product = product.toObject()
        }

        product.name = checkedProduct.name;
        product.unitPrice = checkedProduct.finalPrice;
        product.finalPrice = Number((product.unitPrice * product.quantity).toFixed(2));

        subtotal += product.finalPrice
        productList.push(product)
        productIds.push(product.productId)
    }

    const order = await orderModel.create({

        userId: req.user._id,
        note,
        address,
        phone,
        products: productList,
        couponId: req.body.coupon?._id,
        subtotal,
        totalPillAmount: Number((subtotal - (subtotal * ((req.body.coupon?.amount || 0) / 100))).toFixed(2)),
        paymentType,
        status: paymentType == "card" ? "waitForPayment" : "placed"
    })
    if (!order) {
        return next(new Error("Fail to  save your order", { cause: 400 }))
    }


    if (req.body.coupon) {
        await couponModel.updateOne({ _id: req.body.coupon._id }, { $addToSet: { usedBy: req.user._id } })
    }

    for (const product of req.body.products) {
        await productModel.updateOne(
            { _id: product.productId },
            { $inc: { stock: - parseInt(product.quantity) } }
        )
    }

    req.body.isCart ? await clearCart(req.user._id) : await removeItems(req.user._id, productIds)


    return res.status(201).json({ message: "Done", order })


})


export const cancelOrder = asyncHandler(async (req, res, next) => {


    const order = await orderModel.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order) {
        return next(new Error("In-valid orderId", { cause: 400 }))
    }


    if (
        (order.status != "placed" && order.paymentType == "cash") ||
        (order.status != "waitForPayment" && order.paymentType == "card")
    ) {
        return next(new Error(`Sorry cannot cancel your order  now while status is ${order.status} and your payment method is ${order.paymentType}`, { cause: 400 }))
    }


    order.status = "canceled"
    await order.save()


    if (order.couponId) {
        await couponModel.updateOne({ _id: order.couponId }, { $pull: { usedBy: req.user._id } })
    }

    for (const product of order.products) {
        await productModel.updateOne(
            { _id: product.productId },
            { $inc: { stock: parseInt(product.quantity) } }
        )

    }

    const cart = await cartModel.findOneAndUpdate({ userId: req.user._id }, { products: order.products }, { new: true })
    return res.status(200).json({ message: "Done", order , cart })
})