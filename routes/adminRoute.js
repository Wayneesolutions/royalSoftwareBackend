import express from 'express'
import { adminCreation, adminDashboard, adminLogin } from '../controllres/adminController.js'
import {  getUsersByRole, createUser, getUserById } from '../controllres/adminUserController.js'
import { createCompany, deleteCompany, getCompanies, updateCompany } from '../controllres/companyController.js'

const adminRoute = express.Router()

adminRoute.post('/create',adminCreation)
adminRoute.post('/login',adminLogin)
adminRoute.get('/dashboard',adminDashboard)



// company managemant
adminRoute.post('/create-company',createCompany)
adminRoute.get('/list-all-companies',getCompanies)
adminRoute.patch('/update-company/:id',updateCompany)
adminRoute.delete('/delete-company/:id',deleteCompany)


// user management
adminRoute.get('/role/:role',getUsersByRole)
adminRoute.get('/get-user/:id',getUserById)
adminRoute.post('/create-user',createUser)

export default adminRoute