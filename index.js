const express = require('express');
const app = express();
const axios = require('axios');
const mongoose = require("mongoose");
const bodyParser = require('body-parser');
const SOURCE_API_TOKEN = '3008640-3031053-PYZJ8THKWQTYM0LEXSSNEMTO3JLLUV1FXWT3PVP3QN6S537K7V51A233ZD5FEXIB';
// const INVENTORY_ID = "29162";
// const PRICE_GROUP_ID = "26433";
const API_TOKEN = "4000595-4002564-YXOR5Y8M53AYGE8PX0LN2F283T0U6PPGUIJ8F8LB0G9TYLWA8Z9604F5HXIH7N8W";
const INVENTORY_ID = "12795";
const PRICE_GROUP_ID = "12654";
const API_URL = 'https://api.baselinker.com/connector.php';
const FormData = require('form-data');
const catalog = require("./catalogue");
const december = require("./december").products
const catalogNew = require("./catalogueNew");
const orders = require("./orders");
const bcrypt = require("bcrypt")
const cors = require('cors')

const sourceHeaders = {
    'X-BLToken': SOURCE_API_TOKEN
}
const mongoDB = "mongodb+srv://admin-jacek:zD92wzCUPzmTG8BN@cluster0.igxpa.mongodb.net/avonDB?retryWrites=true&w=majority";
mongoose.connect(mongoDB, { useNewUrlParser: true, useUnifiedTopology: true });

const Schema = mongoose.Schema;

const UserSchema = new Schema({
    username: { type: String, unique: true, required: true },
    password: String,
    baselinkerToken: String,
    storageId: String,
    priceGroupId: String,
    discount: Number
});

const User = mongoose.model('user', UserSchema);

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.use(cors());
app.get("/catalogue_new", (req, res) => {
    res.json({ products: catalogNew.products });
})
app.post("/check", (req, res) => {
    var token = JSON.parse(Object.keys(req.body)[0]).token;
    const methodParams = JSON.stringify({});
    const apiParams = new URLSearchParams({
        method: "getInventories",
        parameters: methodParams
    });
    axios.post(API_URL, apiParams, {
        headers: {
            'X-BLToken': token
        }
    }).then(resp => {
        if (resp.data.status === "SUCCESS" && resp.data.inventories && resp.data.inventories.length) {
            res.json({ success: true, inventoryId: resp.data.inventories[0].inventory_id, priceGroupId: resp.data.inventories[0].price_groups[0] })
        } else {
            res.json({ success: false })
        }
    }).catch(err => {
        res.json({ success: false })
    })

})
app.post("/register", (req, res) => {
    var data = JSON.parse(Object.keys(req.body)[0]);
    bcrypt.hash(data.password, 10, function(err, hash) {
        var user = new User({
            username: data.username,
            password: hash,
            baselinkerToken: data.token,
            storageId: data.inventoryId,
            priceGroupId: data.priceGroupId,
            discount: data.discount
        });
        user.save()
            .then(saved => {
                if (saved) {
                    res.json({ userId: saved._id, username: saved.username });
                }
            })
            .catch(error => {
                res.status(400).json({ error: "Zajęta nazwa użytkownika" })
            });
    });

})
app.post("/login", (req, res) => {
    var data = JSON.parse(Object.keys(req.body)[0]);
    User.findOne({ username: data.username }, (error, user) => {
        if (error || !user) {
            res.status(400).json({ error: "Niepoprawna nazwa użytkownika" })
        } else {
            bcrypt.compare(data.password, user.password, function(err, result) {
                if (result) {
                    res.json({ userId: user._id, username: user.username });
                } else {
                    res.status(400).json({ error: "Niepoprawne hasło" })
                }
            });


        }
    });

})
app.get("/catalogue/:month", (req, res) => {
    var skus = [];
    // if (req.params.month == 12) {
    //     res.json({ products: december.filter(el => el.isConditional) })
    // }
    var discount = 40;
    var userId = req.query.userId ? req.query.userId : "";
    if (req.params.month == 12) {
        skus = december.map(el => el.sku);
    }
    User.findOne({ _id: userId }, (error, user) => {
        if (error) {} else {
            discount = user.discount;
        }
        axios.post("https://api.ce.avon.digital-catalogue.com/avon-mas/PL/product/view-data/202212/?brochureId=C12_PL_R_CORE", { skus })
            .then(resp => {
                const resProducts = [];
                resp.data.result.filter(el => el.categoryTags.length).forEach(product => {
                    product.variantGroups[0].variants.forEach(variant => {
                        var productDiscount = product.isConditional ? 10 : product.categoryTags.findIndex(el => el === "Akcesoria") > -1 ? 20 : discount;

                        if (product.promotions.length) {
                            if (product.promotions[0].description.includes("przy zakupie dwóch sztuk")) {
                                var stringPrice = product.promotions[0].description.split(" ").map(el => el.replace(",", ".")).find(el => !isNaN(el));
                                product.promotionPrice = parseFloat(stringPrice);
                            } else if (product.promotions[0].description.includes("Kup 1 za") && product.promotions[0].description.includes("a drug")) {
                                var prices = product.promotions[0].description.split("Kup 1 za")[1].split(" ").map(el => {
                                    if (el.charAt(el.length - 1) === ",") {
                                        el = el.slice(0, -1);
                                    }
                                    return el.replace(",", ".")
                                }).filter(el => !!el && !isNaN(el)).map(el => parseFloat(el));
                                var sum = 0;
                                prices.forEach(el => { sum += el });
                                if (sum > 0) {
                                    product.promotionPrice = Math.ceil(sum * 50) / 100;
                                }
                            }
                        }
                        resProducts.push({
                            name: `${product.name} ${variant.name}`,
                            sku: variant.lineNumber,
                            price: product.promotionPrice ? product.promotionPrice.toFixed(2) : product.hasPromotions && !product.isConditional ? "0" : product.price.toFixed(2),
                            finalPrice: product.promotionPrice ? Math.ceil(product.promotionPrice * (100 - productDiscount)) / 100 : product.hasPromotions && !product.isConditional ? 0 : Math.ceil(product.price * (100 - productDiscount)) / 100,
                            promotion: product.promotions.length ? product.promotions[0].description : "",
                            discount: productDiscount,
                            imageUrl: product.imageUrls[0]
                        })
                    })
                })
                res.json({ products: resProducts, discount: discount });
            })
            .catch(err => {
                res.status(500).json({ error: "Błąd serwera" })
            })
    });


})
app.get("/catalogue", (req, res) => {
    let skus = [];
    catalog.products.forEach(product => {
        skus.push(product.sku);
    })
    axios.post("https://api.ce.avon.digital-catalogue.com/avon-mas/PL/product/view-data/202210/?brochureId=C10_PL_R_CORE", { skus }).then(resp => {

            const promises = [];
            const returnProducts = [];
            const tempProducts = resp.data.result;
            var getProducts = function(products) {
                products.forEach(resProduct => {
                    resProduct.variantGroups.forEach(variantGroup => {
                        variantGroup.variants.forEach(variant => {
                            if (variant.lineNumber) {
                                let promise = axios.post("https://apim-eu.api-prod.aws.avon.com/v1/PL/PL/rep/59207710/order?groups=header,custords,discnt", {
                                    "cmpgnId": 202210,
                                    "items": [{
                                        "custId": 0,
                                        "lineNr": variant.lineNumber,
                                        "placOrdSctnCd": "REGULAR",
                                        "qty": 6,
                                        "cmpgnId": 202210
                                    }],
                                    "ordNm": "KINGA ZALEWSKA",
                                    "ordType": "REG"
                                }, {
                                    headers: {
                                        "x-sec-token": "eyJ0eXAiOiJKV1QiLCJraWQiOiIyMjIxMmQ1YzljOWE5MTIzNGU2NDQ3YzdhZGU4NTU2NjgyOThmYjFiIiwiYWxnIjoiUlMyNTYifQ.eyJzdWIiOiI1OTIwNzcxMCIsImF1ZCI6IlJFUCIsInZlciI6Miwic2NvcGUiOiJSRVAiLCJpc3MiOiJodHRwczovL2F3YS1wcm9kLWFnczN3cmFwcGVyLWF1dGhvcml6ZXIuczMuZXUtd2VzdC0xLmFtYXpvbmF3cy5jb20vIiwiZXhwIjoxNjY0NjYyODgyLCJpbXAiOjU5MjA3NzEwLCJpYXQiOjE2NjQ2NjEwODIsInRpZCI6IlBMIn0.k4LmvPfBH0v8CGsDfCkPKpEH34qBVBFE0yvcex5HOB5UpbgswNbZPrNYe5v_cU8OiP_mNgm6TAY-KlkhgnUjtqjcjWBTiI9WBLiD09Ahg4zDCx-_jtPe98_Ix2g7IRtsvVdcz3s_32mt267J8-7Eh0fYkiU-_FBNIxXtdF66YGk_FlTdVCBkTrEy7TtdgK5pB_cKq1OGtjy1ZZxSJNdvkfxGF_nN5Kjnk2SgDvbGIcUVwLvloPCu8_l1gTwiYJszaDpyQ2IVRVp22j8AVpo-pnj9qeygoho32i71yu6JI_yOJM29udr0AlmRFRujhx3V0JnsDagizQE36QpWgLOVHZH0ZZvsJPFCdPBZ3pDjWZi6v3pFFju9-fRoFIp2B7p2LDWxXnmw3Qr5yxw1VjCmLAuMlpEHrTsnvYiouRnJ1vEjYKNZ_m6dqC4_ycKz-OvolSsiw1ONJjjynT9HYehZvzqsuxO4jN03CegTggF07QHOLu5f7jIxpsNdt9bJwpZxJqpvUleNvh0daF_m_M-i9RV5kxPDenEbX6s7S_pWSsTXOoirRdLDlKD-3pbdSavWNx713urJEfwUjf099ZTlj68FW4uzjyennR_xB-fJVKGbdj3WRf28JzrBpDbF2fwOKYRtnntFHVN2rEcFcdsBTEpmWiJetHnJLpP02_2SflA"
                                    }
                                })
                                promises.push(promise);
                            }
                        })
                    })

                })
                Promise.allSettled(promises)
                    .then(values => {
                        const orders = values.filter(el => el.status === "fulfilled").map(el => el.value.data).filter(el => el.noOfItems > 0);
                        const errors = values.filter(el => {
                            return el.status === "rejected" && el.reason.response.statusText === "Gateway Timeout";
                        })
                        const products = [];
                        orders.forEach(order => {

                            order.custOrds.forEach(custOrd => {
                                custOrd.items.forEach(item => {
                                    tempProducts.splice(tempProducts.findIndex(el => el.variantGroups.findIndex(ell => ell.variants.findIndex(elll => elll.lineNumber == item.lineNr) > -1) > -1), 1)
                                    products.push({
                                        id: item.itemId,
                                        sku: item.lineNr,
                                        price: order.pymtAmt / 6,
                                        name: item.prodNm
                                    })
                                })
                            })
                        })
                        returnProducts.push(...products);
                        if (errors.length) {
                            getProducts(tempProducts)
                        } else {
                            res.json(returnProducts);
                            console.log(returnProducts.length)
                        }

                    })
                    .catch(err => {
                        console.log(err)
                    })
            }
            getProducts(tempProducts);

        })
        .catch(err => {
            console.log(err);
        })
});
app.get("/copy", (req, res) => {
    var sourceProducts = [];
    var destinationProducts = [];
    const sourceMethodParams = JSON.stringify({
        'inventory_id': "29162",
        "filter_stock_from": 1138,
        "filter_stock_to": 1139
    });
    const sourceApiParams = new URLSearchParams({
        method: "getInventoryProductsList",
        parameters: sourceMethodParams
    });
    const destinationMethodParams = JSON.stringify({
        'inventory_id': "12795",
        "page": 1
    });
    const destinationApiParams = new URLSearchParams({
        method: "getInventoryProductsList",
        parameters: destinationMethodParams
    });
    const destinationMethodParams2 = JSON.stringify({
        'inventory_id': "12795",
        "page": 2
    });
    const destinationApiParams2 = new URLSearchParams({
        method: "getInventoryProductsList",
        parameters: destinationMethodParams2
    });
    const foundProductsStock = {};
    const foundProductsPrice = {};
    const notFoundProducts = [];
    axios.post(API_URL, sourceApiParams, {
        headers: sourceHeaders
    }).then(sourceRes => {
        sourceProducts = Object.values(sourceRes.data.products);
        axios.post(API_URL, destinationApiParams, {
            headers: headers
        }).then(destRes1 => {
            destinationProducts = Object.values(destRes1.data.products);
            axios.post(API_URL, destinationApiParams2, {
                headers: headers
            }).then(destRes2 => {
                destinationProducts.push(...Object.values(destRes2.data.products));
                sourceProducts.forEach(sourceProduct => {
                    var found = destinationProducts.find(el => el.name === sourceProduct.name);
                    if (found) {
                        foundProductsStock[found.id] = { "bl_13574": sourceProduct.stock["bl_37507"] };
                        foundProductsPrice[found.id] = { "12654": sourceProduct.prices["26433"] };
                    } else {
                        notFoundProducts.push(sourceProduct);
                    }
                })
                const productIds = notFoundProducts.map(el => parseInt(el.id));
                const methodParams2 = JSON.stringify({ 'inventory_id': "29162", products: productIds });
                const apiParams2 = new URLSearchParams({
                    method: "getInventoryProductsData",
                    parameters: methodParams2
                })
                const methodParamsObject = JSON.stringify({ 'inventory_id': "12795", products: foundProductsStock });
                const apiParams3 = new URLSearchParams({
                    method: "updateInventoryProductsStock",
                    parameters: methodParamsObject
                });
                axios.post(API_URL, apiParams3, {
                    headers: headers
                }).then(changeResp => {
                    const methodParamsObject2 = JSON.stringify({ 'inventory_id': "12795", products: foundProductsPrice });
                    const apiParams3 = new URLSearchParams({
                        method: "updateInventoryProductsPrices",
                        parameters: methodParamsObject2
                    });
                    axios.post(API_URL, apiParams3, {
                        headers: headers
                    }).then(changeREsp2 => {

                    })
                })
            })
        })
    })

});
app.get("/products", (req, resp) => {
    var userId = req.query.userId ? req.query.userId : "";
    User.findOne({ _id: userId }, (error, user) => {
        if (error) {
            res.status(400).json({ error: "Błąd serwera" })
        } else {
            const token = user.baselinkerToken;
            const storageId = user.storageId;
            const priceGroupId = user.priceGroupId;
            const headers = {
                'X-BLToken': token
            }
            const methodParams = JSON.stringify({ 'inventory_id': storageId });
            const apiParams = new URLSearchParams({
                method: "getInventoryProductsList",
                parameters: methodParams
            });
            axios.post(API_URL, apiParams, {
                headers: headers
            }).then(res => {
                const productIds = Object.keys(res.data.products).map(el => parseInt(el));
                const methodParams2 = JSON.stringify({ 'inventory_id': storageId, products: productIds });
                const apiParams2 = new URLSearchParams({
                    method: "getInventoryProductsData",
                    parameters: methodParams2
                })
                axios.post(API_URL, apiParams2, {
                    headers: headers
                }).then(res2 => {
                    const resProducts = Object.entries(res2.data.products).map(el => {
                        return {
                            _id: el[0],
                            name: el[1].text_fields.name,
                            price: parseFloat(el[1].prices[priceGroupId]),
                            sku: el[1].sku,
                            imageUrl: Object.values(el[1].images)[0],
                            soldQuantity: 0
                        }
                    });
                    const methodParams3 = JSON.stringify({ 'inventory_id': storageId, page: 2 });
                    const apiParams3 = new URLSearchParams({
                        method: "getInventoryProductsList",
                        parameters: methodParams3
                    })
                    axios.post(API_URL, apiParams3, {
                        headers: headers
                    }).then(res3 => {
                        const productIds2 = Object.keys(res3.data.products).map(el => parseInt(el));
                        const methodParams4 = JSON.stringify({ 'inventory_id': storageId, products: productIds2 });
                        const apiParams4 = new URLSearchParams({
                            method: "getInventoryProductsData",
                            parameters: methodParams4
                        })
                        axios.post(API_URL, apiParams4, {
                            headers: headers
                        }).then(async res4 => {
                            resProducts.push(...Object.entries(res4.data.products).map(el => {
                                return {
                                    _id: el[0],
                                    name: el[1].text_fields.name,
                                    price: parseFloat(el[1].prices[priceGroupId]),
                                    sku: el[1].sku,
                                    imageUrl: Object.values(el[1].images)[0],
                                    soldQuantity: 0
                                }
                            }));
                            const orders = [];
                            const getOrders = async function(date) {
                                var methodParams6 = JSON.stringify({ "date_confirmed_from": date + 1 });
                                var apiParams6 = new URLSearchParams({
                                    method: "getOrders",
                                    parameters: methodParams6
                                })
                                axios.post(API_URL, apiParams6, {
                                    headers: headers
                                }).then(res6 => {
                                    var length = res6.data.orders.length;
                                    var lastDate = res6.data.orders[length - 1].date_confirmed;
                                    orders.push(...res6.data.orders);
                                    if (length === 100) {
                                        getOrders(lastDate);
                                    } else {
                                        orders.forEach(order => {
                                            order.products.forEach(product => {
                                                var found = resProducts.find(resProduct => resProduct._id == product.product_id);
                                                if (found) {
                                                    found.soldQuantity += product.quantity;
                                                }
                                            })
                                        })
                                        resProducts.sort((a, b) => b.soldQuantity - a.soldQuantity);
                                        resp.send({ value: resProducts });
                                    }
                                })
                            }

                            const apiOrders = await getOrders(0);


                        })
                    })


                })




            })
        }
    })

})

app.post("/prices", (req, res) => {
    var userId = req.query.userId ? req.query.userId : "";
    User.findOne({ _id: userId }, (error, user) => {
        if (error) {
            res.status(500).json({ error: "Błąd serwera" })
        } else {
            const token = user.baselinkerToken;
            const storageId = user.storageId;
            const priceGroupId = user.priceGroupId;
            const headers = {
                'X-BLToken': token
            }
            const resProducts = JSON.parse(Object.keys(req.body)[0]),
                baselinkerResProducts = [];
            resProducts.forEach(product => {
                var obj = {}
                obj[product._id] = {}
                obj[product._id][priceGroupId] = product.price;
                baselinkerResProducts.push(obj);
            })
            const productsObject = {};

            baselinkerResProducts.forEach(el => {
                productsObject[Object.keys(el)[0]] = Object.values(el)[0]
            })
            const methodParamsObject = JSON.stringify({ 'inventory_id': storageId, products: productsObject });
            const apiParams2 = new URLSearchParams({
                method: "updateInventoryProductsPrices",
                parameters: methodParamsObject
            });
            axios.post(API_URL, apiParams2, {
                    headers: headers
                }).then(resp => {
                    if (resp.data.status === 'SUCCESS') {
                        res.send({ countSuccess: resp.data.counter, countError: Object.entries(resp.data.warnings).length });
                    }
                })
                .catch(error => {
                    res.status(500).json({ error: "Błąd serwera" })
                })
        }
    })

})



const PORT = process.env.PORT || 1337;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`)
})