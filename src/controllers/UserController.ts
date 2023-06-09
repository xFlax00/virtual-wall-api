// DB
import { administradores, usuarios } from "@prisma/client"
// Protocols
import { HttpResponse } from "./protocols"
// Repository
import { UserRepository } from "../repositories/UserRepository"
// Dependencies
import * as EmailValidator from "email-validator"
import jwt from "jsonwebtoken"
import bcrypt from "bcrypt"
import { isAdmin } from "../models/Admin"
import { AdminRepository } from "../repositories/AdminRepository"

export const UserController = {
  async getAll(): Promise<HttpResponse<usuarios[]>> {
    try {
      const users = await UserRepository.getAllUsers()
      // Check if any failure occurred
      if (!users) {
        return {
          statusCode: 404,
          body: "Users not found.",
        }
      }

      // Getting all users sucessfully
      return {
        statusCode: 200,
        body: users,
      }
    } catch (error) {
      return {
        statusCode: 500,
        body: "Something went wrong.",
      }
    }
  },

  async createUser(
    body: isAdmin
  ): Promise<HttpResponse<Omit<usuarios, "senha">>> {
    try {
      // Checking if all required properties are filled
      const requireProps = ["email", "nome", "senha", "tipo", "username"]
      let verifyRequiredProp = ""
      requireProps.forEach((prop) => {
        if (!(prop in body)) {
          verifyRequiredProp = prop
          return
        }
      })

      if (verifyRequiredProp) {
        if (verifyRequiredProp === "username") {
          verifyRequiredProp = "Nome de usuário"
        }
        verifyRequiredProp =
          verifyRequiredProp.charAt(0).toUpperCase() +
          verifyRequiredProp.slice(1)

        return {
          statusCode: 404,
          body: `Required '${verifyRequiredProp}!'`,
        }
      }

      // Checking if username already exists
      const usernameExists = await UserRepository.getUserByUsername(body.username)
      if(usernameExists) {
        return {
          statusCode: 400,
          body: "Username already exists."
        }
      }

      // Checking if email is valid
      if (!EmailValidator.validate(body.email)) {
        return {
          statusCode: 400,
          body: "Invalid email.",
        }
      }

      // Checking if user already exists
      if (await UserRepository.getUserByEmail(body.email)) {
        return {
          statusCode: 401,
          body: "Email already registered.",
        }
      }

      // Checking if password has at least 8 characters
      if(body.senha.length < 8) {
        return {
          statusCode: 400,
          body: "Password requires at least 8 characters."
        }
      }

      // Checking if admin code is valid
      if (body.adminCode && body.adminCode !== "@souadmin" || body.adminCode === "") {
        return {
          statusCode: 404,
          body: "Admin code invalid.",
        }
      }

      const newPass = await bcrypt.hash(body.senha, Number(process.env.SALT))
      body.senha = newPass

      // Create a new user
      const newUser = await UserRepository.createUser(body)
      // Check if any failure occurred
      if (!newUser) {
        return {
          statusCode: 400,
          body: "User not created.",
        }
      }

      // Register admin
      let newAdmin: administradores | null = null
      if (body.adminCode) {
        newAdmin = await AdminRepository.createAdmin(newUser.id_usuario)
      }

      const token = jwt.sign(
        { userId: body.id_usuario, adminId: newAdmin?.id_admin},
        `${process.env.TOKEN_SECRET}`,
        { expiresIn: "1h" }
      )
      // // User created successfully
      return {
        statusCode: 201,
        body: newAdmin ? "Admin created successfully." : "User created successfully.",
        token: token
      }
    } catch (error) {
      return {
        statusCode: 500,
        body: "Something went wrong.",
      }
    }
  },

  async loginUser({ email, senha }: usuarios): Promise<HttpResponse<usuarios>> {
    // Find user by email
    const user = await UserRepository.getUserByEmail(email)
    if (!user) {
      return {
        statusCode: 400,
        body: "Invalid credentials.",
      }
    }
    // Checking if password is correct
    const verifyPassword = await bcrypt.compare(senha, user.senha)
    if (!verifyPassword) {
      return {
        statusCode: 400,
        body: "Invalid credentials.",
      }
    }

    const isAdmin = await AdminRepository.getAdminById(user.id_usuario)

    // Generate token
    const token = jwt.sign(
      { userId: user.id_usuario, adminId: isAdmin?.id_admin },
      `${process.env.TOKEN_SECRET}`,
      { expiresIn: "1h" }
    )
    return {
      statusCode: 200,
      body: isAdmin ? "Authentication admin successful.": "Authentication user successful.",
      token: token
    }
  },
}
