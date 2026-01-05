
const approvedOrderSample = {
    success: true,
    company: {
        id: "60d5ec49f1b4c82c8c8e8e8e",
        name: "Royal Paints Pvt Ltd",
        code: "ROYAL01",
        guid: "COMP12345"
    },
    totalOrders: 1,
    orders: [
        {
            _id: "60d5f0b5f1b4c82c8c8e9999",
            orderNumber: "ROYAL01-ORD-20231025-0001",
            orderDate: "2023-10-25T10:30:00.000Z",
            status: "approved",

            // Customer Info
            customerName: "Rahul Sharma",
            customerEmail: "rahul.sharma@example.com",
            customerMobile: "9876543210",
            customerAddress: {
                street: "123, MG Road",
                city: "Bangalore",
                state: "Karnataka",
                pincode: "560001",
                country: "India"
            },
            shippingAddress: {
                street: "456, Indiranagar",
                city: "Bangalore",
                state: "Karnataka",
                pincode: "560038",
                country: "India"
            },

            // Dealer Info
            dealer: {
                name: "Bangalore Paints & Hardware",
                id: "60d5f123f1b4c82c8c8e7777",
                email: "contact@bangalorepaints.com",
                mobile: "9988776655",
                address: {
                    street: "Shop No. 10, Market Road",
                    city: null, // Often null in Ledger
                    state: "Karnataka",
                    pincode: null,
                    country: "India"
                },
                ledgerGUID: "LEDGER-GUID-001"
            },

            // SubDealer Info (if applicable)
            subDealer: {
                name: "Suresh Traders",
                id: "60d5f456f1b4c82c8c8e6666",
                type: "Sub Dealer",
                email: "suresh@traders.com",
                mobile: "8877665544",
                address: {
                    street: "1st Main, Jayanagar",
                    city: null,
                    state: "Karnataka",
                    pincode: "560011",
                    country: "India"
                }
            },

            // Financials
            totalAmount: 10000.00,
            discountAmount: 500.00,
            taxableValue: 9500.00,
            taxAmount: 1710.00,
            finalAmount: 11210.00,
            cgstTotal: 855.00,
            sgstTotal: 855.00,
            igstTotal: 0.00,

            // Items
            items: [
                {
                    productCode: "PROD001",
                    productName: "Premium Emulsion 20L",
                    description: "High quality interior paint",
                    hsnCode: "32091010",
                    quantity: 2,
                    unitPrice: 5000.00,
                    discount: 5.0, // 5%
                    taxAmount: 1710.00,
                    totalPrice: 11210.00,
                    cgstAmount: 855.00,
                    sgstAmount: 855.00,
                    igstAmount: 0.00
                }
            ],

            createdAt: "2023-10-25T10:30:00.000Z",
            updatedAt: "2023-10-25T14:45:00.000Z"
        }
    ]
};

const unapprovedOrderSample = {
    success: true,
    company: {
        id: "60d5ec49f1b4c82c8c8e8e8e",
        name: "Royal Paints Pvt Ltd",
        code: "ROYAL01",
        guid: "COMP12345"
    },
    totalOrders: 1,
    orders: [
        {
            _id: "60d5faaaaf1b4c82c8c8e5555",
            orderNumber: "ROYAL01-ORD-20231026-0005",
            orderDate: "2023-10-26T09:15:00.000Z",
            status: "pending_approval",

            // Customer Info
            customerName: "Amit Verma",
            customerEmail: "amit.verma@example.com",
            customerMobile: "9123456780",
            customerAddress: {
                street: "789, Residency Road",
                city: "Mysore",
                state: "Karnataka",
                pincode: "570001",
                country: "India"
            },
            // ... shipping address same structure

            // Dealer Info
            dealer: {
                name: "Mysore Distributors",
                id: "60d5fbbbbf1b4c82c8c8e4444",
                email: "info@mysoredist.com",
                mobile: "9000011111",
                address: {
                    street: "Old Mysore Road, Near Bus Stand",
                    city: "Mysore", // Might be present if from User model
                    state: "Karnataka",
                    pincode: "570002",
                    country: "India"
                }
            },

            // SubDealer Info (null example)
            subDealer: null,

            // Financials
            totalAmount: 5000.00,
            discountAmount: 0.00,
            taxableValue: 5000.00,
            taxAmount: 900.00,
            finalAmount: 5900.00,
            cgstTotal: 450.00,
            sgstTotal: 450.00,
            igstTotal: 0.00,

            // Items
            items: [
                {
                    productCode: "PROD005",
                    productName: "Exterior Primer 10L",
                    description: "Base coat for exterior walls",
                    hsnCode: "32089090",
                    quantity: 2,
                    unitPrice: 2500.00,
                    discount: 0,
                    taxAmount: 900.00,
                    totalPrice: 5900.00,
                    cgstAmount: 450.00,
                    sgstAmount: 450.00,
                    igstAmount: 0.00
                }
            ],

            createdBy: {
                _id: "60d5fcccbf1b4c82c8c8e3333",
                name: "Salesman 1",
                email: "sales1@royalpaints.com",
                userName: "sales1",
                role: "salesman"
            },
            createdAt: "2023-10-26T09:15:00.000Z",
            updatedAt: "2023-10-26T09:15:00.000Z"
        }
    ]
};

console.log("=== APPROVED ORDERS SAMPLE ===");
console.log(JSON.stringify(approvedOrderSample, null, 2));
console.log("\n");
console.log("=== UNAPPROVED ORDERS SAMPLE ===");
console.log(JSON.stringify(unapprovedOrderSample, null, 2));
