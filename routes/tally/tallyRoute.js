import express from 'express'
import { 
    createCompany, 
    createUser, 
    listCompanies, 
    listUsers 
} from '../../controllres/tallyController.js'

export const tallyRoute = express.Router()

tallyRoute.post('/create-user',createUser)
tallyRoute.post('/create-company',createCompany)

tallyRoute.get('/list-users',listUsers)
tallyRoute.get('/list-companies',listCompanies)