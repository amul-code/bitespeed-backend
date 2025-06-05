import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const identifyContact = async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber } = req.body;
    if (!email && !phoneNumber) {
      return res.status(400).json({ error: "Email or phoneNumber is required" });
    }

    // 1. Find all matching contacts by email or phone
    const matchedContacts = await prisma.contact.findMany({
      where: {
        OR: [
          { email: email || undefined },
          { phoneNumber: phoneNumber || undefined },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    // 2. If no match, create new primary contact
    if (matchedContacts.length === 0) {
      const newContact = await prisma.contact.create({
        data: { email, phoneNumber },
      });

      return res.json({
        contact: {
          primaryContactId: newContact.id,
          emails: [email].filter(Boolean),
          phoneNumbers: [phoneNumber].filter(Boolean),
          secondaryContactIds: [],
        },
      });
    }

    // 3. Separate into primary and secondary contacts
    const primary = matchedContacts.find(c => c.linkPrecedence === "primary") || matchedContacts[0];

    // 4. Update newer primaries to become secondaries
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

    // 5. Check if current email/phone combo is not fully covered → add new secondary contact
    const existsExactMatch = matchedContacts.some(c => c.email === email && c.phoneNumber === phoneNumber);

    if (!existsExactMatch && (email || phoneNumber)) {
      await prisma.contact.create({
        data: {
          email,
          phoneNumber,
          linkPrecedence: "secondary",
          linkedId: primary.id,
        },
      });
    }

    // 6. Get full family tree of contacts
    const allContacts = await prisma.contact.findMany({
      where: {
        OR: [
          { id: primary.id },
          { linkedId: primary.id },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    // 7. Prepare response
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
