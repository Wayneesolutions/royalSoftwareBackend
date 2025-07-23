import express from 'express'
import { adminCreation, adminDashboard, adminLogin } from '../controllres/adminController.js'

const adminRoute = express.Router()

adminRoute.post('/create',adminCreation)
adminRoute.post('/login',adminLogin)
adminRoute.get('/dashboard',adminDashboard)
export default adminRoute