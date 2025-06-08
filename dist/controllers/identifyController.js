"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const identifyContact = async (req, res) => {
    try {
        const { email, phoneNumber } = req.body;
        if (!email && !phoneNumber) {
            res.status(400).json({ error: "Email or phoneNumber is required" });
            return;
        }
        // Filter undefined values out before Prisma query
        const conditions = [];
        if (email)
            conditions.push({ email });
        if (phoneNumber)
            conditions.push({ phoneNumber });
        const matchedContacts = await prisma.contact.findMany({
            where: { OR: conditions },
            orderBy: { createdAt: "asc" },
        });
        // No match → create new primary contact
        if (matchedContacts.length === 0) {
            const newContact = await prisma.contact.create({
                data: { email, phoneNumber },
            });
            res.json({
                contact: {
                    primaryContactId: newContact.id,
                    emails: [email].filter(Boolean),
                    phoneNumbers: [phoneNumber].filter(Boolean),
                    secondaryContactIds: [],
                },
            });
            return;
        }
        // Find the oldest primary or fallback to first
        const primary = matchedContacts.find(c => c.linkPrecedence === "primary") || matchedContacts[0];
        // Convert other primaries to secondaries
        for (const contact of matchedContacts) {
            if (contact.linkPrecedence === "primary" && contact.id !== primary.id) {
                await prisma.contact.update({
                    where: { id: contact.id },
                    data: {
                        linkPrecedence: "secondary",
                        linkedId: primary.id,
                    },
                });
            }
        }
        // Check if the current email/phone combo already exists
        const existsExactMatch = matchedContacts.some(c => c.email === email && c.phoneNumber === phoneNumber);
        if (!existsExactMatch) {
            await prisma.contact.create({
                data: {
                    email,
                    phoneNumber,
                    linkPrecedence: "secondary",
                    linkedId: primary.id,
                },
            });
        }
        // Get all related contacts (primary + secondaries)
        const allContacts = await prisma.contact.findMany({
            where: {
                OR: [{ id: primary.id }, { linkedId: primary.id }],
            },
            orderBy: { createdAt: "asc" },
        });
        const emails = Array.from(new Set(allContacts.map(c => c.email).filter(Boolean)));
        const phoneNumbers = Array.from(new Set(allContacts.map(c => c.phoneNumber).filter(Boolean)));
        const secondaryContactIds = allContacts
            .filter(c => c.linkPrecedence === "secondary")
            .map(c => c.id);
        res.json({
            contact: {
                primaryContactId: primary.id,
                emails,
                phoneNumbers,
                secondaryContactIds,
            },
        });
    }
    catch (err) {
        console.error("Error in identifyContact:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.default = identifyContact;
